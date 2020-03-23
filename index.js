const chromium = require("chrome-aws-lambda");
const Cdp = require("chrome-remote-interface");
const { spawn } = require("child_process");

function sleep(miliseconds = 100) {
  return new Promise(resolve => setTimeout(() => resolve(), miliseconds));
}

async function run(url, duration, lobby, audio, slow) {
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

  const { DOM, Network, Page, Runtime, Emulation, Input } = client;
  Runtime.consoleAPICalled(entry => {
    console.log(
      "console api called: " + entry.args.map(arg => arg.value).join(" ")
    );
  });

  try {
    await Promise.all([
      Network.enable(),
      Page.enable(),
      DOM.enable(),
      Runtime.enable()
    ]);

    if (slow) {
      await Network.emulateNetworkConditions({
        offline: false,
        latency: 500,
        downloadThroughput: 100000,
        uploadThroughput: 50000
      });
    }

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

    const height = 720;

    await Emulation.setDeviceMetricsOverride({
      mobile: false,
      deviceScaleFactor: 0,
      scale: 1,
      width: 1280,
      height: height
    });

    await Emulation.setVisibleSize({
      width: meta && meta.width ? meta.width : 1280,
      height: meta && meta.height ? meta.height : height
    });

    if (!lobby) {
      const { root } = await DOM.getDocument();

      for (let i = 0; i < 60; i++) {
        try {
          const { nodeId: dataId } = await DOM.querySelector({
            nodeId: root.nodeId,
            selector: "#bot-data-input"
          });

          await DOM.setFileInputFiles({
            nodeId: dataId,
            files: [`${process.env.LAMBDA_TASK_ROOT}/bot-recording.json`]
          });

          break;
        } catch (e) {
          console.log("No data node yet.");
          await new Promise(res => setTimeout(() => res(), 500));
        }
      }

      if (audio) {
        await Input.dispatchMouseEvent({
          type: "mousePressed",
          x: 100,
          y: 100,
          button: "left",
          clickCount: 1
        });
        await Input.dispatchMouseEvent({
          type: "mouseReleased",
          x: 100,
          y: 100,
          button: "left",
          clickCount: 1
        });

        for (let i = 0; i < 60; i++) {
          try {
            const { nodeId: audioId } = await DOM.querySelector({
              nodeId: root.nodeId,
              selector: "#bot-audio-input"
            });

            await DOM.setFileInputFiles({
              nodeId: audioId,
              files: [`${process.env.LAMBDA_TASK_ROOT}/bot-recording.mp3`]
            });
            break;
          } catch (e) {
            console.log("No audio node yet.");
            await new Promise(res => setTimeout(() => res(), 500));
          }
        }
      }
    }
    await new Promise(res => setTimeout(() => res(), duration * 1000));
  } catch (error) {
    console.error(error);
  }

  chrome.kill();
  await client.close();

  return { data, meta };
}

module.exports.handler = async function handler(event, context, callback) {
  console.log("handling");
  console.log(JSON.stringify(event));
  const queryStringParameters = event.query || {};
  const {
    hub_sid,
    host = "hubs.mozilla.com",
    duration = 30,
    password,
    lobby,
    audio,
    slow
  } = queryStringParameters;

  if (password !== "") {
    return callback(null, {
      statusCode: 200,
      body: "bad password"
    });
  }

  const url = `https://${host}/${hub_sid}${lobby ? "" : "?bot=true"}`;

  try {
    await run(url, duration, !!lobby, !!audio, !!slow);
  } catch (error) {
    console.error("Error running", url, error);
    return callback(error);
  }

  return callback(null, {
    statusCode: 200,
    body: "done"
  });
};
