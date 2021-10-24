const puppeteer = require('puppeteer');
const chromeLauncher = require('chrome-launcher');
const axios = require('axios');
const Xvfb = require('xvfb');
require('dotenv').config();
const fs = require('fs');
const minimist = require('minimist');

const args = minimist(process.argv)

async function run() {
    const chromeConfig = {
      port: 8080,
      chromeFlags: ['--start-maximized', '--remote-debugging-port=8080'],
      permissions: ['clipboardWrite'],
    }

    async function launch() {
      const chrome = await chromeLauncher.launch(chromeConfig);

      console.log('PORT:', chrome.port); 
      console.log('PATH: ', chrome.chromePath);// to see chrome launcher instance properties
      const response = await axios.get(
        `http://localhost:${chrome.port}/json/version`,
      )
      const { webSocketDebuggerUrl } = response.data;

      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        defaultViewport: null,
        args: ['--start-maximized'],
      })

      const context = browser.defaultBrowserContext();
      await context.overridePermissions('https://us05web.zoom.us/profile', [
        'clipboard-read',
        'clipboard-write',
      ]);

      const page = await browser.newPage();

      const cookiesJSON = fs.readFileSync("pageCookies.json", "utf-8");
      let cookies = JSON.parse(cookiesJSON);

      // cookies = cookies.map(function(cookie){
      //     cookie.expires = -1;
      //     return cookie;
      // })

      await page.setCookie(...cookies);

      const applicationJSON = fs.readFileSync("application.json", "utf-8");
      const application = JSON.parse(applicationJSON);

      await page.evaluate(function(application){
        window.name = application.window;
        localStorage = application.localStorage;
        sessionStorage = application.sessionStorage;
      }, application);


      await page.waitForTimeout(10000);

      await page.goto(`${process.env.dashboardLink}`, { waitUntil: 'networkidle2' });

    //   await page.waitForNavigation();

      const coos = await page.cookies();
      console.log(coos);

      



      
    }

   

    launch()
      .then(function(){
        console.log('ok');
      })
      .catch(function(err){
        console.error(err);
      })
}


//COMMENT BELOW IIFE TO RUN AS CRONJOB
(async function letsGo(){
  console.log("LET'S GOOOOO......");
  await run();
})();


module.exports.run = run;
