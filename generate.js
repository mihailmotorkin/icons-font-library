//Импорты необходимых модулей
const fs = require('fs-extra'); //Работа с файловой системой
const path = require('path'); // Работа с путями в файловой системе
const axios = require('axios'); // Работа с HTTP-запросами
const crypto = require('crypto'); // Генерация уникальных идентификаторов
const unzipper = require('unzipper'); // Распаковка zip-архивов
const { optimize } = require('svgo'); // Оптимизация SVG-файлов
const FormData = require('form-data'); // Форматирование данных для HTTP-запросов

const assetsDir = path.join(__dirname, 'assets');
const distDir = path.join(__dirname, 'dist');

// Конфигурация для оптимизации SVG, можно дополнить необходимым
const svgConfig = {
  plugins: [
    { name: 'removeViewBox', active: false },
    { name: 'removeDimensions', active: true },
    { name: 'removeDoctype', active: true },
    { name: 'removeMetadata', active: true }
  ]
}

// Генерация уникального идентификатора
function generateUID() {
  return crypto.randomBytes(16).toString('hex');
}
// Чтение всех SVG-иконок из директории проекта
async function readSvgIcons(projectDir) {
  const files = await fs.readdir(projectDir); // Список файлов в директории
  return files.filter(file => file.endsWith('.svg')); // Фильтр только SVG-файлов
}
// Оптимизация SVG-файла
async function optimizeSvg(svgData) {
  const result = await optimize(svgData, svgConfig); // Применение конфигурации SVGO
  return result.data; // Возвращение оптимизированного содержимого
}
// Сохранение оптимизированного SVG-файла
async function saveOptimizedSvg(tempDir, fileName, svgData) {
  const filePath = path.join(tempDir, fileName); // Путь для сохранения
  await fs.writeFile(filePath, svgData); // Запись данных в файл
}
// Оптимизация всех SVG-иконок в проекте
async function optimizeAllIcons(projectName, projectDir, tempDir) {
  try {
    const files = await readSvgIcons(projectDir); // Чтение списка SVG-файлов
    const promises = files.map(async file => {
      const filePath = path.join(projectDir, file); // Путь к исходному файлу
      const svgData = await fs.readFile(filePath, 'utf8'); // Чтение содержимого
      const optimizedSvg = await optimizeSvg(svgData); // Оптимизация содержимого

      await saveOptimizedSvg(tempDir, file, optimizedSvg); // Сохранение оптимизированного файла
      });
      await Promise.all(promises); // Ожидание завершения всех задач
  } catch (error) {
    console.error(`Ошибка при оптимизации иконок для проекта ${projectName}:`, error);
  }
}
// Генерация JSON-конфигурации для Fontello
async function generateConfig(tempDir, projectName) {
  const files = await fs.readdir(tempDir); // Список файлов во временной директории
  const icons = await Promise.all(files.filter(file => file.endsWith('.svg')).map(async (file, index) => {
    const filePath = path.join(tempDir, file);
    const svgContent = await fs.readFile(filePath, 'utf8'); // Чтение содержимого SVG

    // Извлечение данных для конфигурации
    const pathMatch = svgContent.match(/<path d="([^"]+)"/);
    const widthMatch = svgContent.match(/width="(\d+)"/);

    return {
      uid: generateUID(), // Уникальный идентификатор иконки
      css: path.basename(file, '.svg'), // Название CSS-класса
      code: 0xE001 + index, // Уникальный код для иконки
      src: "custom_icons", // Источник
      selected: true, // Отметка о выборе
      svg: {
          path: pathMatch ? pathMatch[1] : '', // Путь внутри SVG
          width: widthMatch ? parseInt(widthMatch[1], 10) : 1000 // Ширина
      },
      search: [path.basename(file, '.svg')], // Теги для поиска
    };
  }));

  const config = {
    name: projectName, // Название проекта
    css_prefix_text: projectName + '-', // Префикс для CSS-классов
    css_use_suffix: false, // Не использовать суффиксы
    hinting: true, // Подсказки
    units_per_em: 1000, // Единицы измерения
    ascent: 850, // Отступ сверху
    glyphs: icons // Массив иконок
  };

  const configFilePath = path.join(tempDir, 'config.json'); // Путь для сохранения конфигурации
  await fs.writeFile(configFilePath, JSON.stringify(config, null, 2)); // Запись файла
  console.log('Конфигурация успешно создана в', configFilePath);
  return configFilePath; // Возврат пути конфигурации
}

// Создание сеанса в Fontello и получение session_id
async function createFontelloSession(configFilePath) {
  try {
    // Создание формы с загрузкой конфигурационного файла
    const form = new FormData();
    form.append('config', fs.createReadStream(configFilePath)); // Добавление конфигурации в форму
    // Отправка POST-запроса на сервер Fontello
    const response = await axios.post('https://fontello.com', form, {
      headers: {
        ...form.getHeaders(),
        'Content-Type': 'multipart/form-data'
      }
    });
    // Получение session_id из ответа сервера
    const sessionId = typeof response.data === 'string' ? response.data : null;

    if (!sessionId) {
      throw new Error('Не удалось получить session_id')
    }
    // Возвращает идентификатор сессии для дальнейших запросов
    return sessionId;
  } catch (error) {
      console.error('Ошибка при создании сеанса Fontello:', error);
      throw error;
  }
}
// Функция для загрузки сгенерированных файлов шрифта с Fontello
async function downloadFont(sessionId, outputDir) {
  try {
    // GET-запрос на сервер Fontello для скачивания zip-архива
    const response = await axios.get(`https://fontello.com/${sessionId}/get`, {
      responseType: 'arraybuffer'
    });
    console.log('Статус ответа:', response.status);

    if (response.status === 200) {
      // Сохранение zip-архива в указанной директории
      const zipFilePath = path.join(outputDir, 'font.zip');
      await fs.ensureDir(outputDir);
      await fs.writeFile(zipFilePath, response.data);
      console.log('Шрифт загружен и сохранён в', outputDir);
      return zipFilePath; // Возвращает путь к сохраненному zip-файлу
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
// Функция для извлечения zip-архива
async function extractZip(zipFilePath, outputDir) {
  return new Promise((resolve, reject) => {
    // Чтение zip-файла и распаковка в указанную директорию
    fs.createReadStream(zipFilePath).pipe(
        unzipper.Extract({ path: outputDir }))
        .on('close', () => {
          console.log('Архив успешно извлечен в', outputDir);
          resolve(); // Успешное завершение
        })
        .on('error', reject); // Обработка ошибок
  });
}
// Функция для удаления пустой директории
async function removeIfEmpty(directory) {
  if (await fs.pathExists(directory)) {
    const files = await fs.readdir(directory);
    if (files.length === 0) {
      // Удаление директории, если она пуста
      await fs.remove(directory);
      console.log(`Удалена пустая директория: ${directory}`);
    }
  }
}
// Копирует или перемещает файлы в целевую директорию, основываясь на списке разрешенных файлов
async function copyOrMoveFiles(sourceDir, targetDir, allowedFiles) {
  // Читаем список всех файлов в исходной директории
  const files = await fs.readdir(sourceDir);

  for (const file of files) {
    // Формируем полные пути к файлу в исходной и целевой директориях
    const srcPath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    // Проверяем, является ли файл директорией
    const isDirectory = (await fs.stat(srcPath)).isDirectory();

    // Если файл находится в списке разрешённых
    if (allowedFiles.includes(file)) {
      if (isDirectory) {
        // Копируем директорию
        await fs.copy(srcPath, targetPath);
      } else {
        // Перемещаем файл с перезаписью, если он уже существует
        await fs.move(srcPath, targetPath, { overwrite: true });
      }
    }
  }
}
// Функция для очистки css директории от не нужных файлов
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

// Сортирует файлы проекта: переносит css и font в выходную директорию,
// удаляет временные директории, очищает лишние файлы
async function sortFiles(projectName) {
  try {
    // Пути к временной директории и выходной директории проекта
    const fontDir = path.join(__dirname, 'temp', projectName);
    const projectDir = path.join(__dirname, 'dist', projectName);

    // Проверяем, существует ли временная директория
    if (await fs.pathExists(fontDir)) {
      // Получаем имя папки, содержащей сгенерированные файлы Fontello
      const [fontelloDirName] = await fs.readdir(fontDir);

      if (fontelloDirName) {
        const fontelloPath = path.join(fontDir, fontelloDirName);
        const allowedFiles = ['css', 'font']; // Разрешённые папки

        // Убедимся, что целевая директория существует
        await fs.ensureDir(projectDir);
        // Копируем или перемещаем только разрешённые папки
        await copyOrMoveFiles(fontelloPath, projectDir, allowedFiles);
        // Очищаем директорию css от ненужных файлов
        await cleanupCssDir(projectDir, projectName);
        // Удаляем временные директории, если они пустые
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
// Функция для объединения двух css файлов в один
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
    // Удаление первоначальных файлов
    await fs.remove(animationCssPath);
    await fs.remove(projectCssPath);
    console.log(`Старые CSS файлы удалены для проекта: ${projectName}`);

  } catch (error) {
    console.error(`Ошибка при объединении CSS файлов для проекта ${projectName}:`, error.message);
  }
}
// Функция очистки временной директории
async function cleanup(tempDir) {
  try {
    if (fs.existsSync(tempDir)) {
      await fs.remove(tempDir);
    }
  } catch (error) {
    console.error('Ошибка при удалении временных директорий:', error.message);
  }
}
// Общая функция для оптимизации иконок, генерации шрифта, сортировки файлов
async function processProject(projectName) {
  // Пути к исходной директории, временной директории и выходной директории
  const projectDir = path.join(assetsDir, projectName);
  const tempDir = path.join(__dirname, 'temp');
  const outputDir = path.join(tempDir, projectName);

  // Проверка, что временные директории существуют
  await fs.ensureDir(tempDir);
  await fs.ensureDir(outputDir);
  // Оптимизация всех иконок проекта
  await optimizeAllIcons(projectName, projectDir, tempDir);
  // Генерация конфигурации для Fontello
  const configFilePath = await generateConfig(tempDir, projectName);
  // Создание сессии Fontello и скачивание архива со шрифтами
  const sessionId = await createFontelloSession(configFilePath);
  const zipFilePath = await downloadFont(sessionId, tempDir);

  await extractZip(zipFilePath, outputDir); // Распаковка архива
  await sortFiles(projectName); // Сортировка файлов в выходной директории
  await cleanup(tempDir); // Очистка временных директорий
  await combineCssFiles(projectName); // Объединение CSS-файлов проекта
}
// Главная функция программы, обрабатывает список проектов
async function main() {
  const projects = ['emotion', 'erp', 'ceres']; // Список проектов для обработки

  // Удаляем выходную директорию, если она существует, и создаём её заново
  await fs.remove(distDir);
  await fs.ensureDir(distDir);

  // Обрабатываем каждый проект
  for (const projectName of projects) {
    await processProject(projectName);
  }
  // Копируем файл package.json в выходную директорию
  const sourcePackageJsonPath = path.join(__dirname, 'package.json');
  const targetPackageJsonPath = path.join(distDir, 'package.json');

  await fs.copyFile(sourcePackageJsonPath, targetPackageJsonPath);
  console.log('Файл package.json скопирован в dist');
}

main();