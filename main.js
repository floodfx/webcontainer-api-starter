import './style.css'
import { WebContainer } from '@webcontainer/api';
import { files } from './files';

/** @type {import('@webcontainer/api').WebContainer}  */
let webcontainerInstance;

let helloFilePath = '/src/server/liveview/hello.ts'

window.addEventListener('load', async () => {
  const helloContents = files['src']['directory']['server']['directory']['liveview']['directory']['hello.ts'].file.contents;
  textareaEl.value = helloContents;
  textareaEl.addEventListener('input', (e) => {
    writeIndexJS(e.currentTarget.value);
  });

  // Call only once
  webcontainerInstance = await WebContainer.boot();
  console.log("files", files)
  await webcontainerInstance.mount(files);

  const ls = await webcontainerInstance.fs.readdir('/src/server/liveview');
  console.log("ls", ls)

  const exitCode = await installDependencies();
  if (exitCode !== 0) {
    throw new Error('Installation failed');
  };

  startDevServer();
});

async function installDependencies() {
  // Install dependencies
  const installProcess = await webcontainerInstance.spawn('npm', ['install']);
  installProcess.output.pipeTo(new WritableStream({
    write(data) {
      console.log(data);
    }
  }))
  // Wait for install command to exit
  return installProcess.exit;
}

async function startDevServer() {
  // Run `npm run start` to start the Express app
  await webcontainerInstance.spawn('npm', ['run', 'dev']);

  // Wait for `server-ready` event
  webcontainerInstance.on('server-ready', (port, url) => {
    iframeEl.src = url;
  });
}

/**
 * @param {string} content
 */

async function writeIndexJS(content) {
  await webcontainerInstance.fs.writeFile(helloFilePath, content);
}

document.querySelector('#app').innerHTML = `
  <div class="container">
    <div class="editor">
      <textarea>I am a textarea</textarea>
    </div>
    <div class="preview">
      <iframe src="loading.html"></iframe>
    </div>
  </div>
`

/** @type {HTMLIFrameElement | null} */
const iframeEl = document.querySelector('iframe');

/** @type {HTMLTextAreaElement | null} */
const textareaEl = document.querySelector('textarea');
