const express = require("express");
const puppeteer = require("puppeteer-core");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const os = require("os");
const archiver = require("archiver");
const open = require("open");
const { parse } = require("url");

const app = express();
const port = 3000;

// Definir um diretório TEMP seguro fora do snapshot
const tempDir = path.join(os.tmpdir(), "BaixaLink_images");
if (!fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log(`📂 Diretório temporário criado em: ${tempDir}`);
  } catch (err) {
    console.error("❌ ERRO ao criar diretório temporário:", err);
  }
}

let images = []; // Lista de URLs de imagens

// Limpar diretório TEMP após o download
const clearTempDir = () => {
  try {
    fs.readdirSync(tempDir).forEach((file) => {
      fs.unlinkSync(path.join(tempDir, file));
    });
  } catch (err) {
    console.error("❌ ERRO ao limpar diretório temporário:", err);
  }
};

// Página inicial
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, "public")));

// Rota para buscar imagens
app.get("/scrape-images", async (req, res) => {
  const { url: siteUrl } = req.query;
  if (!siteUrl) {
    return res.status(400).json({ error: "Por favor, forneça um URL." });
  }

  try {
    console.log(`🔍 Acessando ${siteUrl} para capturar imagens...`);

    const browser = await puppeteer.launch({
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto(siteUrl, { waitUntil: "domcontentloaded" });

    console.log("✅ Página carregada! Buscando imagens...");

    const imgUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("img"))
        .map((img) => img.src)
        .filter((src) => src && !src.startsWith("data:image/"));
    });

    await browser.close();

    if (imgUrls.length === 0) {
      return res.status(404).json({ error: "Nenhuma imagem encontrada." });
    }

    images = [...new Set(imgUrls)];
    console.log(`📸 ${images.length} imagens encontradas!`);

    res.json({ images });
  } catch (error) {
    console.error("❌ ERRO AO BUSCAR IMAGENS:", error);
    res.status(500).json({ error: "Erro ao acessar o site.", details: error.message });
  }
});

// Rota para baixar as imagens em um ZIP
app.get("/download-zip", async (req, res) => {
  if (images.length === 0) {
    return res.status(400).json({ error: "Nenhuma imagem disponível para download." });
  }

  try {
    console.log("📦 Criando arquivo ZIP...");

    const zipFileName = "images.zip";
    const zipFilePath = path.join(os.tmpdir(), zipFileName);
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.pipe(output);

    for (const imageUrl of images) {
      const fileName = path.basename(parse(imageUrl).pathname);
      const filePath = path.join(tempDir, fileName);

      try {
        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(filePath);
          axios
            .get(imageUrl, { responseType: "stream" })
            .then((response) => {
              response.data.pipe(writer);
              writer.on("finish", resolve);
              writer.on("error", reject);
            })
            .catch((error) => reject(error));
        });

        archive.file(filePath, { name: fileName });
      } catch (error) {
        console.error(`Erro ao baixar ${imageUrl}: ${error.message}`);
      }
    }

    archive.finalize();

    output.on("close", () => {
      console.log("✅ ZIP pronto para download!");
      res.download(zipFilePath, zipFileName, (err) => {
        if (err) {
          console.error("Erro ao baixar ZIP:", err);
        } else {
          clearTempDir();
          fs.unlinkSync(zipFilePath);
          images = [];
        }
      });
    });
  } catch (error) {
    console.error("❌ ERRO AO CRIAR ZIP:", error);
    res.status(500).json({ error: "Erro ao criar o arquivo ZIP." });
  }
});

// Mantém o processo rodando
setInterval(() => {}, 1000);

// Inicia o servidor
app.listen(port, async () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  await open(`http://localhost:${port}`);
});
