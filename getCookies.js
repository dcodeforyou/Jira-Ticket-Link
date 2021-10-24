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

      await page.goto(`${process.env.jiraLink}`, { waitUntil: 'networkidle2' });

      await page.focus('input#userNameInput');
      await page.keyboard.type(`${process.env.email}`, { delay: 50 });

      await page.focus('input#passwordInput');
      await page.keyboard.type(`${process.env.password}`);

      await page.click('span#submitButton');
      // await page.waitForTimeout(4000);
      await page.waitForNavigation();

      await page.waitForTimeout(50000);

      let applicationObj = {};

      const client = await page._client;
      console.log(client);
      applicationObj.sessionId = client._sessionId;
      fs.writeFileSync("application.json", JSON.stringify(applicationObj), "utf-8");

      await page.waitForTimeout(10000);

      const { cookies } = await page._client.send('Network.getAllCookies');
      const ck = await page.cookies();


      console.log("COOKIES: ", cookies);
      // fs.writeFileSync("clientCookies.json", JSON.stringify(cookies), "utf-8");

      fs.writeFileSync("pageCookies.json", JSON.stringify(ck), "utf-8");

      const name = await page.evaluate(async function(){
        return await window.name;
      });

      console.log("NAME: ", name);
      applicationObj.window = name;
      fs.writeFileSync("application.json", JSON.stringify(applicationObj), "utf-8");

      await page.exposeFunction('waitFor', waitFor);
      async function waitFor(){
        await page.waitForTimeout(10000);
      }

      const keys = await page.evaluate(async function(){
        const k = await caches.keys();
        return k;
      });

      console.log("KEYS: ", keys);
    
      await page.waitForTimeout(5000);

      const ls = await page.evaluate(function(){
        return JSON.stringify(localStorage);
      });

      console.log("LOCAL STORAGE: ", ls);
      applicationObj.localStorage = ls;
      fs.writeFileSync("application.json", JSON.stringify(applicationObj), "utf-8");

      const ss = await page.evaluate(function(){
        return JSON.stringify(sessionStorage);
      });

      console.log("SESSION STORAGE: ", ss);
      applicationObj.sessionStorage = ss;
      fs.writeFileSync("application.json", JSON.stringify(applicationObj), "utf-8");

      

      // fs.writeFileSync("jiraCookies.json", JSON.stringify(cookies), "utf-8");
     
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
