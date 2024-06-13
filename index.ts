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

const input = configArr.filter((x) => x.length === 3).map(([title, minuteLapse, url]) => ({
  url,
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

     // always check past hour, lowest filter that consistently works
    //  Also remove bad characters
    const properUrl = url.replace(/f_TPR\=r\d+/, minuteLapse <= 60 ? `f_TPR=r3600` : `f_TPR=r3600`).replace(/\n/g, '').trim()
  
    // Full puppeteer API is available
    await page.goto(properUrl);
  
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
      notifier.notify({
        title,
        message: `Found ${links.length} Job Postings`,
        sound: 'Basso', // Only Notification Center or Windows Toasters
        actions: 'Open in Chrome',
        timeout: false,
        contentImage: `${process.cwd()}/LinkedIn.svg`,
      },
      async function (_error, response, _metadata) {
        if(response === 'activate') {
          const command = links.slice(0, limit).map(([_, _url]) => `open -a "Google Chrome" "${_url}"`).join(' && sleep 0.1 && ')
          await exec(command)
          fs.writeFileSync('./cache', _cachedUrls + links.map(([_, _url]) => `${_url.split('?')[0]}\n`).join(''), {
            encoding: 'utf-8'
          });
          if(links.length >= 10)
            grabLinks({title, url, minuteLapse})
        }
      });
    }
}

(function run() {
  input.forEach(({minuteLapse, title, url}) => {
    grabLinks({title, url, minuteLapse})
    cron.schedule(`*/${minuteLapse} * * * *`, () => {
      grabLinks({title, url, minuteLapse})
    });
  })
})()