import puppeteer from 'puppeteer';
import notifier from 'node-notifier'
import cron from 'node-cron'
import { exec } from 'child_process';
import * as fs from 'fs-extra'

const configCSV = fs.readFileSync('./searches.csv', {
  encoding: 'utf-8',
})

const configArr = configCSV.split('\n').map((line) => line.split(','));

configArr.shift()

const input = configArr
  .filter((x) => x.length >= 3)
  .filter(([title]) => !title.toLowerCase().includes('skip'))
  .map(([title, minuteLapse, ...urlParts]) => ({
    url: urlParts.join(','), // Rejoin URL parts in case URL contained commas
    title,
    minuteLapse: Number.parseInt(minuteLapse)
  }))

console.log('Searching LinkedIn for')
input.forEach(({title, minuteLapse}) => {
  console.log(`- ${title} every ${minuteLapse} minutes`)
})

const _cachedUrls = fs.readFileSync('./cache', {
  encoding: 'utf-8',
})

const cachedUrls = ((_cachedUrls.includes('\n')) ? _cachedUrls.split('\n') : []).filter((x) => x.length !== 0)

const limit = process.env.LIMIT || 10;

const grabLinks = async ({title, url, minuteLapse}: {
  url: string;
  title: string;
  minuteLapse: number;
}) => {
    // Launch the browser and open a new blank page
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    try {
      // always check past hour, lowest filter that consistently works
      //  Also remove bad characters
      const properUrl = url.replace(/f_TPR\=r\d+/, minuteLapse <= 60 ? `f_TPR=r3600` : `f_TPR=r3600`).replace(/\n/g, '').trim()
    
      // Full puppeteer API is available
      await page.goto(properUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
      const topLinks = await page.evaluate(() => {
        const results = [] as any;
        document.querySelectorAll('#main-content > section.two-pane-serp-page__results-list > ul > li > div > a').forEach((node) => {
          results.push([(node as any).innerText, node.getAttribute('href')]);
        })
        return results;
      });
      const links = topLinks.filter(([_title, link]: [title: string, link: string]) => {
        if(cachedUrls.length === 0) return true;
        return !cachedUrls.find((x) => {
          return encodeURI(link.split('?')[0]).includes(encodeURI(x))
        })
      })
      if(links.length > 0) {
        console.log(`[${new Date().toISOString()}] Found ${links.length} new job postings for "${title}"`)
        
        notifier.notify({
          title,
          message: `Found ${links.length} Job Postings`,
          sound: 'Basso',
          wait: true,
          timeout: 120,
          icon: `${process.cwd()}/LinkedIn.svg`,
          contentImage: `${process.cwd()}/LinkedIn.svg`,
          open: links[0] ? links[0][1] : undefined,
          actions: ['Open in Chrome', 'Dismiss'],
          dropdownLabel: 'Actions',
          reply: false
        },
        async function (error, response, metadata) {
          if (error) {
            console.error(`[${new Date().toISOString()}] Notification error:`, error);
            return;
          }
          
          console.log(`[${new Date().toISOString()}] Notification response: ${response}`);
          
          if(response === 'activate' || response === 'open in chrome') {
            const command = links.slice(0, limit).map(([_, _url]) => `open -a "Google Chrome" "${_url}"`).join(' && sleep 0.1 && ')
            console.log(`[${new Date().toISOString()}] Opening ${links.slice(0, limit).length} links in Chrome`);
            await exec(command)
            fs.writeFileSync('./cache', _cachedUrls + links.map(([_, _url]) => `${_url.split('?')[0]}\n`).join(''), {
              encoding: 'utf-8'
            });
            if(links.length >= 10) {
              console.log(`[${new Date().toISOString()}] More than 10 links found, will search again`);
              grabLinks({title, url, minuteLapse})
            }
          }
        });
      } else {
        console.log(`[${new Date().toISOString()}] No new job postings found for "${title}"`);
      }
    } finally {
      await browser.close();
    }
}

(function run() {
  console.log(`[${new Date().toISOString()}] Starting LinkedIn job scraper...`);
  
  input.forEach(({minuteLapse, title, url}, i) => {
    console.log(`[${new Date().toISOString()}] Scheduling "${title}" to run every ${minuteLapse} minutes`);
    
    // Run immediately on startup
    grabLinks({title, url, minuteLapse}).catch(err => {
      console.error(`[${new Date().toISOString()}] Error in initial run for "${title}":`, err);
    });
    
    // Schedule for future runs
    cron.schedule(`*/${minuteLapse} * * * *`, () => {
      console.log(`[${new Date().toISOString()}] Running scheduled check for "${title}"`);
      grabLinks({title, url, minuteLapse}).catch(err => {
        console.error(`[${new Date().toISOString()}] Error in scheduled run for "${title}":`, err);
      });
    });
  })
})()