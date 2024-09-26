
// async function sortFiles(projectName) {
//   try {
//     const fontDir = path.join(__dirname, 'temp', projectName);
//     const projectDir = path.join(__dirname, 'dist', projectName);

//     if (await fs.pathExists(fontDir)) {
//       const [fontelloDirs] = await fs.readdir(fontDir);

//       if (fontelloDirs) {
//         const fontelloDirName = path.join(fontDir, fontelloDirs)
//         const files = await fs.readdir(fontelloDirName);
//         const allowedFiles = ['css', 'font'];

//         await fs.ensureDir(projectDir);

//         for(const dir of files) {
//           if (allowedFiles.includes(dir)) {
//             const dirPath = path.join(fontelloDirName, dir);
//             const targetPath = path.join(projectDir, dir);
//             const isDirectory = (await fs.stat(dirPath)).isDirectory();

//             if (isDirectory && dir === 'css') {
//               const targetCssDir = path.join(projectDir);
//               await fs.ensureDir(targetCssDir);
//               await fs.copy(dirPath, targetCssDir);
//             } else {
//               await fs.move(dirPath, targetPath, { overwrite: true });
//             }
//           }
//         }
//         await fs.remove(fontelloDirName);

//         const isFontDirEmpty = (await fs.readdir(fontDir)).length === 0;

//         if (isFontDirEmpty) {
//           await fs.remove(fontDir);
//         }

//         console.log(`Сортировка завершена. Оставлены только файлы: ${allowedFiles.join(', ')}`);
//       }
//     } else {
//       console.error(`Директория 'font' не найдена в проекте: ${projectName}`);
//     }
//   } catch (error) {
//     console.error(`Ошибка при обходе директории: ${error.message}`);
//   }
// }