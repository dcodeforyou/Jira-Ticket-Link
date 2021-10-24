const puppeteer = require('puppeteer');
const chromeLauncher = require('chrome-launcher');
const axios = require('axios');
const Xvfb = require('xvfb');
require('dotenv').config();
const fs = require('fs');
const minimist = require('minimist');
const path = require("path");

const args = minimist(process.argv);

const githubRootURL = `https://github.com`;

async function run() {
    const chromeConfig = {
      port: 8080,
      chromeFlags: ['--start-maximized', '--remote-debugging-port=8080'],
      permissions: ['clipboardWrite'],
    }

    //////////LAUNCH CHROME////////////////////////
    async function launch() {

      const chrome = await chromeLauncher.launch(chromeConfig);

      console.log('PORT:', chrome.port); 
      console.log('PATH: ', chrome.chromePath);// to see chrome launcher instance properties
      const response = await axios.get(
        `http://localhost:${chrome.port}/json/version`,
      )
      const { webSocketDebuggerUrl } = response.data;

      //////////CONNECT CHROME TO PUPPETEER/////////////////
      const browser = await puppeteer.connect({
        browserWSEndpoint: webSocketDebuggerUrl,
        defaultViewport: null,
        args: ['--start-maximized'],
      });

      ///////////PAGE///////////////
      const page = await browser.newPage();

      const cookiesFolder = path.join(__dirname, "Cookies");

      if(!fs.existsSync(cookiesFolder)){
          fs.mkdirSync(path.join(__dirname, "Cookies"));
      }

      let cookies = [];
      let application = {
            microsoft: {
                localStorage: "",
                sessionStorage: ""
            },
            github: {
                localStorage: "",
                sessionStorage: ""
            },
            jira: {
                localStorage: "",
                sessionStorage: ""
            }
      };

      const cookiesFile = path.join(cookiesFolder, "cookies.json");
      const appsFile = path.join(cookiesFolder, "application.json");
      let existedCookies;
      let existedApp;

        if(fs.existsSync( cookiesFile )){
            const existedCookiesJSON = fs.readFileSync("cookies.json", "utf-8");
            existedCookies = JSON.parse(existedCookiesJSON);
        }
        if(fs.existsSync( appsFile )){
            const existedAppJSON = fs.readFileSync("application.json", "utf-8");
            existedApp = JSON.parse(existedAppJSON);
        }
  
      /////////////MICRO-SOFT/////////////////////

      await page.setCookie(...existedCookies);
      await page.evaluate(function(existedApp){
        localStorage = existedApp.microsoft.localStorage;
        sessionStorage = existedApp.microsoft.sessionStorage;
      }, existedApp);

      await page.goto("https://teams.microsoft.com/_#/conversations/");
      await page.waitForNavigation();

      const profileImage = (await page.$(img.user-picture)) || null;
      if(!profileImage){
          await microsoftLogin(page);
          await page.goto("https://teams.microsoft.com/_#/conversations/");
          await page.waitForNavigation();
      }

      /////////////MICRO-SOFT/////////////////////




      /////////////MS-LOGIN/////////////////////

      async function microsoftLogin(page){
        await page.goto("https://www.microsoft.com/en-in/microsoft-teams/log-in", { waitUntil: 'networkidle2' });
        await page.click("a[aria-label='Sign in']");
        await page.waitForNavigation();
        await page.waitForTimeout(4000);

        //WITH COOKIES IF LOGGED IN
        const webRedirect = (await page.$("a.use-app-lnk")) || null;
        if(webRedirect){
            await page.click("a.use-app-lnk");
            await page.waitForNavigation();
            return;
        }

        //WITH COOKIES IF ACCOUNT IS STORED
        const pickAccount = (await page.$('div[role="heading"]')) || null;
        if(pickAccount){
            await page.keyboard.press('Enter');
            await page.waitForNavigation();
            await cxLogin(page);
        }

        await page.waitForTimeout(2000);
        await page.click('input[value="Yes"]');

        await page.waitForNavigation();

        // await page.click("a#ShellSkypeTeams_link");
        const useWeb = (await page.$("a.use-app-lnk")) || null;
        if(useWeb){
            await page.click("a.use-app-lnk");
            await page.waitForNavigation();
        }

        await storeCookies(page, "microsoft");
      }

      ////////////MICRO-SOFT//////////////////////



      ////////////GITHUB - CODE///////////////////////

      await page.setCookie(...existedCookies);
      await page.evaluate(function(existedApp){
        localStorage = existedApp.microsoft.localStorage;
        sessionStorage = existedApp.microsoft.sessionStorage;
      }, existedApp);

      const repos = ['orxe-core-ui', 'orxe-components'];

      for(let i = 0; i < repos.length; i++){
        await page.goto(`https://github.com/${process.env.organisation}/${repos[i]}/pulls/${process.env.githubUsername}`, { waitUntil: 'networkidle2' });

        //Single sign-on
        await page.keyboard.press('Enter');

        const profile = (await page.$("img.avatar-user")) || null;
        if(!profile){
            loginGithub(page);
        }

        const prExists = (await page.$("div[aria-label='Issues']")) || null;
  
        if(prExists){
          const tickets = await page.evaluate(function(){
              const ticketsToLink = [];
              const PRs = document.querySelectorAll("div.js-navigation-container > div");
              for(let j = 0; j < PRs.length; j++){
                  const status = PRs[i].querySelector("a.tooltipped-s").innerText;
                  if(status == 'Approved'){
                      const link = PRs[i].querySelector("a.markdown-title").getAttribute("href");
                      window.open(githubRootURL + link, '_blank');
                      window.addEventListener("load", function(){
                          const prStatus = document.querySelector("div#partial-discussion-header div.flex-self-start > span").innerText;
                          if(prStatus.trim().toLowerCase() == 'merged'){
                              const ticket = document.querySelectorAll("span.commit-ref > a > span")[1].innerText;
                               ticketsToLink.push(ticket.trim());
                          }
                      })
                  }
              }
              return ticketsToLink;
          }); 

          if(tickets.length){
            await linkToJira(repos[i], tickets);
          }
        };
      }
      ////////////GITHUB - CODE///////////////////////


      /////////////////// GITHUB LOGIN //////////////////////////
      async function loginGithub(page){
        await page.goto("https://github.com/", { waitUntil: 'networkidle2' });
        await page.click("a[href='/login']");
  
        await page.waitForNavigation();
        await page.keyboard.type(`${process.env.githubUsername}`);
        await page.keyboard.press("Tab");
        await page.keyboard.type(`${process.env.githubPassword}`);
        await page.keyboard.press("Enter");
  
        await page.waitForNavigation();
        await page.click('a[href="/sessions/two-factor/recovery"]');
        await page.waitForNavigation();
  
        const recoveryJSON = fs.readFileSync("recovery.json", "utf-8");
        const recoveryArr = JSON.parse(recoveryJSON);
        const randomIdx = Math.floor(Math.random() * recoveryArr.length);
        const randomCode = recoveryArr[randomIdx];
  
        await page.keyboard.type(randomCode);
        await page.keyboard.press("Enter");
  
        await page.waitForNavigation();
        
        await storeCookies(page, "github");
      }
      /////////////////// GITHUB LOGIN //////////////////////////
      


      ///////////KR LINK/////////////////////////

      function getKrLink(repo){
          /*
           @Todo: 
           GET KR LINK FROM teams every sprint
          */
          const linksJSON = fs.readFileSync("kr.json", "utf-8");
          const links = JSON.parse(linksJSON);
          links.forEach(function(link){
              if(link.name == repo){
                  return link.url;
              }
          })
      }

      ///////////KR LINK/////////////////////////



      ////////////LINK JIRA//////////////////////////////////

      async function linkToJira(repo, tickets){
            
            const krLink = getKrLink(repo);
            const newPage = await browser.newPage();

            await newPage.setCookie(...existedCookies);
            await newPage.evaluate(function(existedApp){
            localStorage = existedApp.jia.localStorage;
            sessionStorage = existedApp.jira.sessionStorage;
            }, existedApp);


            await newPage.goto(krLink);
            
            await newPage.waitForNavigation();
            const KRElem = (await newPage.$("div.aui-page-header-main a.issue-link")) || null;
            if(!KRElem){
                await loginJira(newPage);
                await newPage.goto(krLink);
                await newPage.waitForNavigation();
            }
            await newPage.click("a#opsbar-operations_more");
            await newPage.waitForTimeout(2000);
            await newPage.click("#link-issue > a");
            await newPage.waitForTimeout(10000);
            
            // enter issues 
            await newPage.focus("textarea#jira-issue-keys-textarea");
            for(let i = 0; i < tickets.length; i++){
                await newPage.keyboard.type(tickets[i], { delay: 10 });
                await newPage.keyboard.press('Enter');
                await newPage.waitForTimeout(1000);
            }

            // await newPage.click("input[value='Link']");
            await newPage.waitForTimeout(10000);
            await newPage.close();

      }
      ////////////LINK JIRA//////////////////////////////////
      



      //////JIRA LOGIN////////////////////

      async function loginJira(page){
        await page.goto(process.env.jiraLink, { waitUntil: 'networkidle2' });
        await cxLogin(page);
        await storeCookies(page, "jira");
      }

      ///////////////JIRA LOGIN/////////////////////////



      ///////////////CXLogin/////////////////////////
      async function cxLogin(page){
        await page.focus('input#userNameInput');
        await page.keyboard.down('ControlLeft');
        await page.keyboard.press('KeyA');
        await page.waitForTimeout(1000);
        await page.keyboard.press('Backspace');
        await page.keyboard.type(process.env.email, { delay: 50 });
  
        await page.focus('input#passwordInput');
        await page.keyboard.type(process.env.password);
  
        await page.click('span#submitButton');
        // await page.waitForTimeout(4000);
        await page.waitForNavigation();
  
        await page.click("div.push-label>button");
  
        await page.waitForNavigation();
      }
      ///////////////CXLogin/////////////////////////





    ///////////////// STORE COOKIES /////////////////

    async function storeCookies(page, type){
        await page.waitForTimeout(10000);
        const ck = await page.cookies();
        cookies = [...ck];

        const ls = await page.evaluate(function(){
            return (localStorage);
        });

        application[`${type}`].localStorage = ls;

        const ss = await page.evaluate(function(){
            return (sessionStorage);
        });

        application[`${type}`].sessionStorage = ss;
    }

    fs.writeFileSync(cookiesFile, JSON.stringify(cookies), "utf-8");
    fs.writeFileSync(appsFile, JSON.stringify(application), "utf-8");
     ///////////////// STORE COOKIES /////////////////
     
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
