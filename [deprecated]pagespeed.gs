/* PageSpeed automation for multiple domains
 - Create 3 sheets as 
    - Settings
      - Put domain identifier for smart notifications starting from B5
      - Put Google Api Key for domain
      - Put Slack webhook URL for domian
    - Log
    - URL Pool
      - Put URLs from A2 and below
*/

const SHEET = SpreadsheetApp.getActiveSpreadsheet();
const API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const TODAY = new Date()

const onOpen = () => {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('PageSpeed Menu')
    .addItem('🚀  -  Start Testing', 'wrapper')
    .addToUi();
}

const wrapper = async () => {
  var activeSheet = SHEET.getSheetByName('Settings');
  var resultRows = activeSheet.getLastRow();
  for (var i = 5; i <= resultRows; i++) {
    var target = activeSheet.getRange(`B${i}:D${i}`).getValues();
    var data = {
      "domain": target[0][0], // URL
      "api_key": target[0][1], // Google API Key
      "slack_hook": target[0][2] // slack hook
    }
    await testRunner(data)
      
  }
}


const testRunner = async (data) => {
  ['mobile', 'desktop'].forEach(async (strategy) => {
    await getURLsFromSheet(strategy,data);
  });
}

const getURLsFromSheet = async (strategy, keyData) => {
  var activeSheet = SHEET.getSheetByName('URL Pool');
  var rows = activeSheet.getLastRow();
  for (var i = 2; i <= rows; i++) {
    var target = activeSheet.getRange(i, 2).getValue();
    if (target.match(keyData.domain)) {
      await getLighthouseResults(target, strategy, keyData)
    }
  }
}

const getLighthouseResults = async (url, strategy, keyData) => {
  console.log(keyData)
  const serviceUrl = `${API_URL}?url=${url}&key=${keyData.api_key}&strategy=${strategy}&category=ACCESSIBILITY&category=BEST_PRACTICES&category=PERFORMANCE&category=PWA&category=SEO`
  var res = await UrlFetchApp.fetch(serviceUrl);
  var data = JSON.parse(res.getContentText());
  var header = JSON.parse(res.getResponseCode());
  switch (header) {
    case 404 || 500:
      Logger.log('Something went wrong!');
    default:
      Logger.log(`Result retrieved for ${url}`);
      lt = data.lighthouseResult;
      const ltMetrics = {
        'strategy': strategy,
        'url': url,
        'performance': lt.categories.performance.score * 100,
        'accessibility': lt.categories.accessibility.score * 100,
        'bestPractices': lt.categories["best-practices"].score * 100,
        'seo': lt.categories.seo.score * 100,
        'firstContentfulPaint': lt.audits['first-contentful-paint'].displayValue,
        'speedIndex': lt.audits['speed-index'].displayValue,
        'totalBlockingTime': lt.audits['total-blocking-time'].displayValue,
        'firstMeaningfulPaint': lt.audits['first-meaningful-paint'].displayValue,
        'cumulativeLayoutShift': lt.audits['cumulative-layout-shift'].displayValue,
        'largestContentfulPaint': lt.audits['largest-contentful-paint'].displayValue,
        'interactive': lt.audits['interactive'].displayValue,
      }
      // Append all Metrics to the Log sheet.
      SpreadsheetApp.getActive().getSheetByName('Log').appendRow(
        [ltMetrics.strategy, 
        ltMetrics.url, 
        ltMetrics.performance, 
        ltMetrics.accessibility, 
        ltMetrics.bestPractices, 
        ltMetrics.seo, 
        ltMetrics.firstContentfulPaint, 
        ltMetrics.speedIndex, 
        ltMetrics.totalBlockingTime, 
        ltMetrics.firstMeaningfulPaint, 
        ltMetrics.cumulativeLayoutShift, 
        ltMetrics.largestContentfulPaint, 
        ltMetrics.interactive,
        `${TODAY.getFullYear()}/${TODAY.getMonth()+1}/${TODAY.getDate()}`]
      );

      await slackNotifier(ltMetrics, keyData);
  }
}


const slackNotifier = async (metrics, keyData) => {
  var payload = {
	"blocks": [
		{
			"type": "header",
			"text": {
				"type": "plain_text",
				"text": `:mega: ${await domainIdentifierHelper(metrics.url, keyData.domain)} - Performance results for ${metrics.strategy.toUpperCase()}`
			}
		},
		{
			"type": "context",
			"elements": [
				{
					"text": `*${TODAY}*`,
					"type": "mrkdwn"
				}
			]
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": `*URL:* ${metrics.url}`
			}
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": `Performance: *${metrics.performance}*  ${await iconHelper(metrics.performance)}  `
			}
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": `Accessibility: *${metrics.accessibility} *  ${await iconHelper(metrics.accessibility)}`
			}
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": `Best Practices: *${metrics.bestPractices} *  ${await iconHelper(metrics.bestPractices)}  `
			}
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": `SEO: *${metrics.seo}*  ${await iconHelper(metrics.seo)}  `
			}
		},
		{
			"type": "divider"
		},
		{
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": "*Lighthouse Results*"
			}
		},
		{
			"type": "section",
			"fields": [
				{
					"type": "plain_text",
					"text": `First contentful Paint => ${metrics.firstContentfulPaint}`,
					"emoji": true
				},
        {
					"type": "plain_text",
					"text": `First Meaningful Paint => ${metrics.firstMeaningfulPaint}`,
					"emoji": true
				},
				{
					"type": "plain_text",
					"text": `Time to Interactive => ${metrics.interactive}`,
					"emoji": true
				},
				{
					"type": "plain_text",
					"text": `Speed Index => ${metrics.speedIndex}`,
					"emoji": true
				},
				{
					"type": "plain_text",
					"text": `Total Blocking Time => ${metrics.totalBlockingTime}`,
					"emoji": true
				},
				{
					"type": "plain_text",
					"text": `Largest Contentful Paint =>  ${metrics.largestContentfulPaint}`,
					"emoji": true
				},
				{
					"type": "plain_text",
					"text": `Cumulative Layout Shift => ${metrics.cumulativeLayoutShift}`,
					"emoji": true
				}
			]
		},
		{
			"type": "divider"
		}
	  ]
  };
  var options = {
    "method": "post",
    "headers": {
      "Content-type": "application/json",
    },
    "payload": JSON.stringify(payload)
  };
  await UrlFetchApp.fetch(keyData.slack_hook, options);
}

const iconHelper = async (value) => {
  let icon;
  if (value > 84) {
    icon = ':large_green_circle:'
  } else if (value > 64 && value < 85 ) {
    icon = ':large_orange_circle:'
  } else {
    icon = ':large_red_square:'
  }

  return icon;
}


const domainIdentifierHelper = async (url,domain) => {
  var state = `Pagespeed Results - ${await pageIdentifierHelper(url)}`
  if (url.match(domain)) {
    state = `${domain.toUpperCase()} - ${await pageIdentifierHelper(url)}`;
  } 

  return state;
}

const pageIdentifierHelper = async (url) => {
  let state;
  switch(true) {
    case /-p-/.test(url):
      state = 'PDP'
      break;
    case /-c-/.test(url):
      state = 'PLP'
      break;
    default:
      state = 'LP'
  }
  return state;
}



