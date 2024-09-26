const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const unzipper = require('unzipper');
const { optimize } = require('svgo');
const FormData = require('form-data');

const assetsDir = path.join(__dirname, 'assets');
const distDir = path.join(__dirname, 'dist');

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
async function readSvgIcons(projectDir) {
  const files = await fs.readdir(projectDir);
  return files.filter(file => file.endsWith('.svg'));
}
async function optimizeSvg(svgData) {
  const result = await optimize(svgData, svgConfig);
  return result.data;
}
async function saveOptimizedSvg(tempDir, fileName, svgData) {
  const filePath = path.join(tempDir, fileName);
  await fs.writeFile(filePath, svgData);
}

async function optimizeAllIcons(projectName, projectDir, tempDir) {
  try {
    const files = await readSvgIcons(projectDir);
    const promises = files.map(async file => {
      const filePath = path.join(projectDir, file);
      const svgData = await fs.readFile(filePath, 'utf8');
      const optimizedSvg = await optimizeSvg(svgData);

      await saveOptimizedSvg(tempDir, file, optimizedSvg);
      });
      await Promise.all(promises);
  } catch (error) {
    console.error(`Ошибка при оптимизации иконок для проекта ${projectName}:`, error);
  }
}

async function generateConfig(tempDir, projectName) {
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
    name: projectName,
    css_prefix_text: projectName + '-',
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

async function downloadFont(sessionId, outputDir) {
  try {
    const response = await axios.get(`https://fontello.com/${sessionId}/get`, {
      responseType: 'arraybuffer'
    });
    console.log('Статус ответа:', response.status);

    if (response.status === 200) {
      const zipFilePath = path.join(outputDir, 'font.zip');
      await fs.ensureDir(outputDir);
      await fs.writeFile(zipFilePath, response.data);
      console.log('Шрифт загружен и сохранён в', outputDir);
      return zipFilePath;
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

async function extractZip(zipFilePath, outputDir) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipFilePath).pipe(
        unzipper.Extract({ path: outputDir })
    ).on('close', () => {
      console.log('Архив успешно извлечен в', outputDir);
      resolve();
    }).on('error', reject);
  });
}

async function removeIfEmpty(directory) {
  if (await fs.pathExists(directory)) {
    const files = await fs.readdir(directory);
    if (files.length === 0) {
      await fs.remove(directory);
      console.log(`Удалена пустая директория: ${directory}`);
    }
  }
}

async function copyOrMoveFiles(sourceDir, targetDir, allowedFiles) {
  const files = await fs.readdir(sourceDir);

  for (const file of files) {
    const srcPath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    const isDirectory = (await fs.stat(srcPath)).isDirectory();

    if (allowedFiles.includes(file)) {
      if (isDirectory) {
        await fs.copy(srcPath, targetPath);
      } else {
        await fs.move(srcPath, targetPath, { overwrite: true });
      }
    }
  }
}

async function cleanupCssDir(projectDir, projectName) {
  try {
    const cssDir = path.join(projectDir, 'css');
    // Проверяем, существует ли директория css
    if (await fs.pathExists(cssDir)) {
      const files = await fs.readdir(cssDir);
      // Проходим по файлам и переносим только animation.css и projectName.css в корень директории проекта
      for (const file of files) {
        const filePath = path.join(cssDir, file);

        if (file === 'animation.css' || file === `${projectName}.css`) {
          const targetPath = path.join(projectDir, file);
          await fs.move(filePath, targetPath, { overwrite: true });
        }
      }
      // После переноса файлов удаляем директорию css
      await fs.remove(cssDir);
      console.log(`Очистка директории css завершена для проекта: ${projectName}`);
    } else {
      console.log(`Директория css не найдена для проекта: ${projectName}`);
    }
  } catch (error) {
    console.error(`Ошибка при очистке директории css для проекта ${projectName}: ${error.message}`);
  }
}



async function sortFiles(projectName) {
  try {
    const fontDir = path.join(__dirname, 'temp', projectName);
    const projectDir = path.join(__dirname, 'dist', projectName);

    if (await fs.pathExists(fontDir)) {
      const [fontelloDirName] = await fs.readdir(fontDir);

      if (fontelloDirName) {
        const fontelloPath = path.join(fontDir, fontelloDirName);
        const allowedFiles = ['css', 'font'];

        await fs.ensureDir(projectDir);
        await copyOrMoveFiles(fontelloPath, projectDir, allowedFiles);

        await cleanupCssDir(projectDir, projectName);

        await removeIfEmpty(fontelloPath);
        await removeIfEmpty(fontDir);

        console.log(`Файлы успешно отсортированы для проекта: ${projectName}`);
      }
    } else {
      console.error(`Директория 'font' не найдена в проекте: ${projectName}`);
    }
  } catch (error) {
    console.error(`Ошибка при сортировке файлов: ${error.message}`);
  }
}

async function combineCssFiles(projectName) {
  try {
    const projectDir = path.join(distDir, projectName);
    const combinedCssFilePath = path.join(projectDir, `${projectName}-style.css`);
    // Путь к css файлам в корне проектной директории
    const animationCssPath = path.join(projectDir, 'animation.css');
    const projectCssPath = path.join(projectDir, `${projectName}.css`);
    // Проверка существования файлов
    const animationCssExists = await fs.pathExists(animationCssPath);
    const projectCssExists = await fs.pathExists(projectCssPath);

    if (!animationCssExists) {
      console.error(`Файл animation.css не найден для проекта ${projectName}.`);
      return;
    }

    if (!projectCssExists) {
      console.error(`Файл ${projectName}.css не найден для проекта ${projectName}.`);
      return;
    }
    // Чтение содержимого файлов
    const animationCss = await fs.readFile(animationCssPath, 'utf8');
    const projectCss = await fs.readFile(projectCssPath, 'utf8');
    // Объединение содержимого
    const combinedCss = `${animationCss}\n${projectCss}`;
    // Сохранение объединенного файла
    await fs.writeFile(combinedCssFilePath, combinedCss);
    console.log(`Объединенный CSS файл создан для проекта: ${projectName}`);

    await fs.remove(animationCssPath);
    await fs.remove(projectCssPath);
    console.log(`Старые CSS файлы удалены для проекта: ${projectName}`);

  } catch (error) {
    console.error(`Ошибка при объединении CSS файлов для проекта ${projectName}:`, error.message);
  }
}

async function cleanup(tempDir) {
  try {
    if (fs.existsSync(tempDir)) {
      await fs.remove(tempDir);
    }
  } catch (error) {
    console.error('Ошибка при удалении временных директорий:', error.message);
  }
}

async function processProject(projectName) {
  const projectDir = path.join(assetsDir, projectName);
  const tempDir = path.join(__dirname, 'temp');
  const outputDir = path.join(tempDir, projectName);

  await fs.ensureDir(tempDir);
  await fs.ensureDir(outputDir);
  await optimizeAllIcons(projectName, projectDir, tempDir);

  const configFilePath = await generateConfig(tempDir, projectName);
  const sessionId = await createFontelloSession(configFilePath);
  const zipFilePath = await downloadFont(sessionId, tempDir);

  await extractZip(zipFilePath, outputDir);
  await sortFiles(projectName);
  await cleanup(tempDir);
  await combineCssFiles(projectName);
}

async function main() {
  const projects = ['emotion', 'erp', 'ceres'];

  await fs.remove(distDir);
  await fs.ensureDir(distDir);

  for (const projectName of projects) {
    await processProject(projectName);
  }

  const sourcePackageJsonPath = path.join(__dirname, 'package.json');
  const targetPackageJsonPath = path.join(distDir, 'package.json');

  await fs.copyFile(sourcePackageJsonPath, targetPackageJsonPath);
  console.log('Файл package.json скопирован в dist');
}

main();