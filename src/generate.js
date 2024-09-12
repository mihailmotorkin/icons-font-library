const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const unzipper = require('unzipper');
const { optimize } = require('svgo');
const FormData = require('form-data');

const iconsDir = path.join(__dirname, 'icons');
const tempDir = path.join(__dirname, 'temp');
const distDir = path.join(__dirname, '../dist');

const svgConfig = {
    plugins: [
        { name: 'removeViewBox', active: false },
        { name: 'removeDimensions', active: true },
        { name: 'removeDoctype', active: true },
        { name: 'removeMetadata', active: true }
    ]
}

function generateUID() {
    return crypto.randomBytes(16).toString('hex');
}
async function readSvgIcons() {
    const files = await fs.readdir(iconsDir);
    return files.filter(file => file.endsWith('.svg'));
}
async function optimizeSvg(svgData) {
    const result = await optimize(svgData, svgConfig);
    return result.data;
}
async function saveOptimizedSvg(fileName, svgData) {
    const filePath = path.join(tempDir, fileName);
    await fs.writeFile(filePath, svgData);
}

async function optimizeAllIcons() {
    try {
        const files = await readSvgIcons();
        const promises = files.map(async file => {
          const filePath = path.join(iconsDir, file);
          const svgData = await fs.readFile(filePath, 'utf8');
          const optimizedSvg = await optimizeSvg(svgData);
          await saveOptimizedSvg(file, optimizedSvg);

          console.log(`${file} оптимизирован и сохранён в temp`);
        });
        await Promise.all(promises);
    } catch (error) {
      console.error('Ошибка при оптимизации иконок:', error);
    }
}

async function generateConfig() {
    const files = await fs.readdir(tempDir);
    const icons = await Promise.all(files.filter(file => file.endsWith('.svg')).map(async (file, index) => {
        const filePath = path.join(tempDir, file);
        const svgContent = await fs.readFile(filePath, 'utf8');

        const pathMatch = svgContent.match(/<path d="([^"]+)"/);
        const widthMatch = svgContent.match(/width="(\d+)"/);

        return {
            uid: generateUID(),
            css: path.basename(file, '.svg'),
            code: 0xE001 + index,
            src: "custom_icons",
            selected: true,
            svg: {
                path: pathMatch ? pathMatch[1] : '',
                width: widthMatch ? parseInt(widthMatch[1], 10) : 1000
            },
            search: [path.basename(file, '.svg')],
        };
    }));

    const config = {
        name: 'myiconfont',
        css_prefix_text: 'icon-',
        css_use_suffix: false,
        hinting: true,
        units_per_em: 1000,
        ascent: 850,
        glyphs: icons
    };

    const configFilePath = path.join(tempDir, 'config.json');
    await fs.writeFile(configFilePath, JSON.stringify(config, null, 2));
    console.log('Конфигурация успешно создана в', configFilePath);
    return configFilePath;
}

async function createFontelloSession(configFilePath) {
    try {
      const form = new FormData();
      form.append('config', fs.createReadStream(configFilePath));

      const response = await axios.post('https://fontello.com', form, {
          headers: {
              ...form.getHeaders(),
              'Content-Type': 'multipart/form-data'
          }
      });

      const sessionId = typeof response.data === 'string' ? response.data : null;

      if (!sessionId) {
        throw new Error('Не удалось получить session_id')
      }

      return sessionId;
    } catch (error) {
        console.error('Ошибка при создании сеанса Fontello:', error);
        throw error;
    }
}

async function downloadFont(sessionId) {
    try {
        const response = await axios.get(`https://fontello.com/${sessionId}/get`, {
            responseType: 'arraybuffer'
        });

        console.log('Статус ответа:', response.status);
        console.log('Тип содержимого ответа:', response.headers['content-type']);
        console.log('Заголовки ответа:', response.headers);

        if (response.status === 200) {
            // Сохраняем файл и проверяем его содержимое
            const filePath = path.join(distDir, 'font.zip');
            await fs.writeFile(filePath, response.data);
            console.log('Шрифт загружен и сохранён в dist');

            // Дополнительно: проверить содержимое zip-файла
            const zip = await unzipper.Open.file(filePath);
            console.log('Файлы внутри архива:', zip.files.map(file => file.path));
        } else {
            console.log('Ответ сервера:', Buffer.from(response.data).toString('utf8'));
            throw new Error('Ожидался zip-файл, но получен другой ответ');
        }
    } catch (error) {
        console.error('Ошибка при загрузке шрифта:', error.message);
        if (error.response) {
            const errorData = Buffer.from(error.response.data).toString('utf8');
            console.error('Статус ответа:', error.response.status);
            console.error('Ответ сервера:', errorData);
        }
        throw error;
    }
}

async function generateFont() {
    try {
      const configFilePath = await generateConfig();
      const sessionId = await createFontelloSession(configFilePath);
      await downloadFont(sessionId);
    } catch (error) {
        console.error('Ошибка при генерации шрифта:', error);
    }
}

async function main() {
    await fs.ensureDir(tempDir);
    await fs.ensureDir(distDir);

    await optimizeAllIcons();
    await generateFont();
}

main();