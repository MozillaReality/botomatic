const chromium = require("chrome-aws-lambda");
const Cdp = require("chrome-remote-interface");
const { spawn } = require("child_process");

function sleep(miliseconds = 100) {
  return new Promise(resolve => setTimeout(() => resolve(), miliseconds));
}

async function screenshot(url, fullscreen) {
  let data, meta;
  let loaded = false;

  const loading = async (startTime = Date.now()) => {
    if (!loaded && Date.now() - startTime < 12 * 1000) {
      await sleep(100);
      await loading(startTime);
    }
  };
  const options = chromium.args.concat([
    "--remote-debugging-port=9222",
    "--window-size=1280x720",
    "--hide-scrollbars"
  ]);

  const path = await chromium.executablePath;
  const chrome = spawn(path, options);
  chrome.stdout.on("data", data => console.log(data.toString()));
  chrome.stderr.on("data", data => console.log(data.toString()));

  let client;

  for (let i = 0; i < 20; i++) {
    try {
      client = await Cdp();
    } catch (e) {
      console.log(e);
      await new Promise(res => setTimeout(res, 500));
    }
  }

  const { Network, Page, Runtime, Emulation } = client;

  try {
    await Promise.all([Network.enable(), Page.enable()]);

    await Emulation.setDeviceMetricsOverride({
      mobile: false,
      deviceScaleFactor: 0,
      scale: 1,
      width: 1280,
      height: 0
    });

    await Page.loadEventFired(() => {
      loaded = true;
    });
    await Page.navigate({ url });
    await loading();

    let height = 720;

    if (fullscreen) {
      const result = await Runtime.evaluate({
        expression: `(
          () => ({ height: document.body.scrollHeight })
        )();
        `,
        returnByValue: true
      });

      height = result.result.value.height;
    }

    await Emulation.setDeviceMetricsOverride({
      mobile: false,
      deviceScaleFactor: 0,
      scale: 1,
      width: 1280,
      height: height
    });

    // Look for a global function _photomnemonicReady and if it exists, wait until it returns true.
    await Runtime.evaluate({
      expression: `new Promise(resolve => {
        if (window._photomnemonicReady) {
          if (window._photomnemonicReady()) {
            resolve();
          } else {
            const interval = setInterval(() => {
              if (window._photomnemonicReady()) {
                clearInterval(interval);
                resolve();
              }
            }, 250)
          }
        } else {
          resolve();
        }
      })`,
      awaitPromise: true
    });

    const metaResult = await Runtime.evaluate({
      expression: `window._photomnemonicGetMeta ? window._photomnemonicGetMeta() : null`,
      returnByValue: true
    });

    if (metaResult.result.value) {
      meta = metaResult.result.value;
    }

    await Emulation.setVisibleSize({
      width: meta && meta.width ? meta.width : 1280,
      height: meta && meta.height ? meta.height : height
    });

    const screenshot = await Page.captureScreenshot({ format: "png" });
    data = screenshot.data;
  } catch (error) {
    console.error(error);
  }

  chrome.kill();
  await client.close();

  return { data, meta };
}

module.exports.handler = async function handler(event, context, callback) {
  const queryStringParameters = event.queryStringParameters || {};
  const {
    url = "https://google.com",
    fullscreen = "false"
  } = queryStringParameters;

  let data;

  const headers = {
    "Content-Type": "image/png"
  };

  try {
    const result = await screenshot(url, fullscreen === "true");
    data = result.data;

    if (result.meta) {
      headers["X-Photomnemonic-Meta"] = JSON.stringify(result.meta);
    }
  } catch (error) {
    console.error("Error capturing screenshot for", url, error);
    return callback(error);
  }

  return callback(null, {
    statusCode: 200,
    body: data,
    isBase64Encoded: true,
    headers
  });
};
