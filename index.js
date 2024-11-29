const express = require('express');
const puppeteer = require('puppeteer-core'); // Usando puppeteer-core
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const open = require('open');
const { parse } = require('url');

const app = express();
const port = 3000;

// Diretório temporário para armazenar as imagens
const tempDir = path.join(__dirname, 'temp_images');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

let images = []; // Variável para armazenar as URLs das imagens

const clearTempDir = () => {
  fs.readdirSync(tempDir).forEach((file) => {
    const filePath = path.join(tempDir, file);
    fs.unlinkSync(filePath); // Exclui cada arquivo
  });
};

app.use(express.static(path.join(__dirname, 'public')));

app.get('/scrape-images', async (req, res) => {
  const { url: siteUrl } = req.query;
  if (!siteUrl) {
    return res.status(400).json({ error: 'Por favor, forneça um URL.' });
  }

  try {
    // Inicializa o Puppeteer
    const browser = await puppeteer.launch({
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', // Caminho para o Chromium (se necessário)
    });
    const page = await browser.newPage();
    await page.goto(siteUrl, { waitUntil: 'networkidle2' });

    // Captura as URLs das imagens da página
    const imgUrls = await page.evaluate(() => {
      const imgElements = document.querySelectorAll('img');
      let imgUrls = [];

      imgElements.forEach((img) => {
        const src = img.src;
        if (src && !src.startsWith('data:image/')) {
          imgUrls.push(src);
        }
      });

      return imgUrls;
    });

    await browser.close();

    // Usa um Set para remover duplicatas
    const uniqueImages = [...new Set(imgUrls)];

    if (uniqueImages.length === 0) {
      return res.status(404).json({ error: 'Nenhuma imagem encontrada.' });
    }

    images = uniqueImages;  // Atualiza o array com as imagens únicas

    res.json({ images: uniqueImages });

  } catch (error) {
    console.error('Erro ao acessar o site:', error);
    res.status(500).json({ error: 'Erro ao acessar o site. Verifique o URL.' });
  }
});

app.get('/download-zip', async (req, res) => {
  if (images.length === 0) {
    return res.status(400).json({ error: 'Nenhuma imagem disponível para download.' });
  }

  try {
    const zipFileName = 'images.zip';
    const zipFilePath = path.join(__dirname, zipFileName);
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);

    // Baixa as imagens e adiciona ao arquivo ZIP
    for (const imageUrl of images) {
      const fileName = path.basename(parse(imageUrl).pathname);
      const filePath = path.join(tempDir, fileName);

      try {
        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(filePath);
          axios.get(imageUrl, { responseType: 'stream' })
            .then(response => {
              response.data.pipe(writer);
              writer.on('finish', resolve);
              writer.on('error', reject);
            })
            .catch(error => reject(error));
        });
        archive.file(filePath, { name: fileName });
      } catch (error) {
        console.error(`Erro ao baixar a imagem ${imageUrl}: ${error.message}`);
      }
    }

    archive.finalize();

    output.on('close', () => {
      res.download(zipFilePath, zipFileName, (err) => {
        if (err) {
          console.error('Erro ao baixar o arquivo:', err);
        } else {
          clearTempDir();
          fs.unlinkSync(zipFilePath);
          images = []; // Reinicia a variável de imagens
        }
      });
    });
  } catch (error) {
    console.error('Erro ao criar o ZIP:', error);
    res.status(500).json({ error: 'Erro ao criar o arquivo ZIP.' });
  }
});

// Inicia o servidor e abre o navegador
app.listen(port, async () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
  await open(`http://localhost:${port}`);
});
