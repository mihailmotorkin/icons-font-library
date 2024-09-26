const { execSync } = require('child_process');
const fs = require('fs');

try {
  execSync('nvm -v', { stdio: 'inherit' });
} catch (error) {
  console.error('NVM is not installed or not available in the environment.');
  process.exit(1);
}

const nvmVersion = fs.readFileSync('.nvmrc', 'utf-8').trim().replace('v', '');
const currentVersion = process.version.replace('v', '');

if (currentVersion !== nvmVersion) {
  try {
    execSync(`nvm use ${nvmVersion}`, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error switching to Node.js version ${nvmVersion}:`, error.message);
    console.error('Make sure NVM is installed and available in your environment.');
    process.exit(1);
  }
} else {
  console.log(`Node.js version ${nvmVersion} is already in use. No need to switch.`);
}

try {
  execSync('node generate.js', { stdio: 'inherit' });
  console.log('Build complete!');
} catch (error) {
  console.error('Error during build process:', error.message);
  process.exit(1);
}
