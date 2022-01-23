const SHEET = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config");
const CLICKUP_KEY = SHEET.getRange("C5:C5").getValue()
const CLICKUP_USER = SHEET.getRange("C6:C6").getValue()
const CLICKUP_TEAMID_MECL = SHEET.getRange("C7:C7").getValue()
const CLICKUP_TEAMID_LS = SHEET.getRange("C8:C8").getValue()
const TARGET_ORDER_STATUS = SHEET.getRange("C9:C9").getValue()
const CLICKUP_TASKFORCE_LIST_ID = SHEET.getRange("C10:C10").getValue()
const CLICKUP_MESTORES_LIST_ID = SHEET.getRange("C11:C11").getValue()
const CLICKUP_LS_LISTID = SHEET.getRange("C12:C12").getValue()
const CLICKUP_FORTUNA_LISTID = SHEET.getRange("C13:C13").getValue()
const CLICKUP_APOLLO_LISTID = SHEET.getRange("C14:C14").getValue()
const SLACK_HOOK = SHEET.getRange("C18:C18").getValue()

const onOpen = () => {
  SpreadsheetApp.getUi().createMenu('Event menu')
    .addItem('🗓️  -  Retrieve meetings', 'cpMeetFromCalToSheet')
    .addItem('🚀  -  Push to Clickup', 'entryController')
    .addItem('🗄️  -  Push to Archive', 'pushToArchive')
    .addToUi();
}

const entryController = async () => {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("entries");
  var resultRows = sheet.getLastRow();
  for (var i = 2; i <= resultRows; i++) {
    var rowValues = sheet.getRange(`A${i}:K${i}`).getValues();
    rowValues.forEach(cell => {
      if (cell[8] == 'AUTH' || cell[8] == 'Pending' && cell[4] == "WORK" || cell[3] == "AWAY") {
        var taskStartDate = new Date(cell[5]).getTime() / 1000;

        var dta = {
          "taskName": cell[1],
          "taskDescription": cell[2],
          "duration": cell[7],
          "dateEpoch": taskStartDate,
          "UDID": cell[0],
          "relations": cell[3],
          "tag": cell[9],
          'time_log_note': cell[10],
          'time_log_status': cell[8]
        }

        var today = new Date().getTime() / 1000;
        if (today > taskStartDate) {
          switch (dta.relations) {
            case ('APOLLO'):
              Logger.log(`Apollo case => ${dta.taskName}`)
              createClickUpTask(dta, CLICKUP_APOLLO_LISTID)
              break;
            case ('FORTUNA'):
              Logger.log(`Fortuna case => ${dta.taskName}`)
              createClickUpTask(dta, CLICKUP_FORTUNA_LISTID)
              break;
            case ('MESTORES'):
              Logger.log(`Mestores case => ${dta.taskName}`)
              createClickUpTask(dta, CLICKUP_MESTORES_LIST_ID)
              break;
            case ('LA3EB'):
              Logger.log(`La3eb case => ${dta.taskName}`)
              createClickUpTask(dta, CLICKUP_TASKFORCE_LIST_ID)
              break;
            case ('LS MINSK'):
              Logger.log('LS MINSK')
              break;
            case ('AWAY'):
              Logger.log('Away')
              findRowByMeetingId(dta.UDID, 'Passed')
              break;
            case ('LS'):
              Logger.log(`Leanscale case => ${dta.taskName}`)
              createClickUpTask(dta, CLICKUP_LS_LISTID, 'LS')
              break;
            default:
              Logger.log(`Default case here => ${dta.taskName}`)
              createClickUpTask(dta, CLICKUP_MESTORES_LIST_ID)
          }
        } else {
          Logger.log(`Task did not finish yet.`)
        }
      }
    });
  }
}

const cpMeetFromCalToSheet = async () => {
  var today = new Date();
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(today);
  Logger.log('Number of events: ' + events.length);
  for (var i = 0; i < events.length; i++) {
    var rel_data = await titleController(events[i].getTitle().toLowerCase());
    var duration = (new Date(events[i].getEndTime()).getTime()) - (new Date(events[i].getStartTime()).getTime())
    // if the meeting is recurring, i am not checking meeting UDID for passing it
    var _findRowByMeetingIdResult = await findRowByMeetingId(events[i].getId())
    let findRowByMeetingIdResult = false
    await events[i].isRecurringEvent() == true ? (Logger.log(`${events[i].getTitle()} is recurring meeting.`)) : (findRowByMeetingIdResult = _findRowByMeetingIdResult.status)
    var result = [
      events[i].getId(),
      events[i].getTitle(), // event title
      events[i].getDescription(), // event desc
      rel_data.relations, // relations
      rel_data.type, // type
      events[i].getStartTime(),
      events[i].getEndTime(),
      duration, // duration
      'Pending', // initial status
      `Automated Timelog`,
      `${events[i].getTitle()} - Automated Timelog Note`,
    ];

    // check whether duration time is equals to Basic Out of office timeline
    switch (duration) {
      case 28800000:
        Logger.log(`Passed values => ${result}`)
        break;
      case 14400000:
        Logger.log(`Passed values => ${result}`)
        break;
      default:
        findRowByMeetingIdResult == false
          ? SpreadsheetApp.getActive().getSheetByName('entries').appendRow(result) : ''
    }
  }
}

// review this for fortuna + apollo
const createClickUpTask = async (dta, list_id, space = 'MECL') => {
  didTaskCreated = await isTaskCreated(dta.taskName)
  if (didTaskCreated.status == false || dta.time_log_status == "AUTH") {
    // create the task
    Logger.log(`${dta.taskName} will be created for the timelog as CLOSED`)
    var url = `https://api.clickup.com/api/v2/list/${list_id}/task`
    var payload = {
      "name": dta.taskName,
      "description": dta.taskDescription,
      "tags": [dta.tag],
      "status": TARGET_ORDER_STATUS
    }

    var params = {
      'method': 'POST',
      'muteHttpExceptions': true,
      'contentType': 'application/json',
      "headers": {
        "Content-Type": "application/json",
        "Authorization": CLICKUP_KEY
      }, "payload": JSON.stringify(payload)
    };

    var res = UrlFetchApp.fetch(url, params);
    var data = JSON.parse(res.getContentText());
    var header = JSON.parse(res.getResponseCode());
    switch (header) {
      case 404 || 500:
        Logger.log('Task creation failed')
        break;
      default:
        await createTimeEntry(data.id, dta, space)
    }
  } else {
    Logger.log(`${dta.taskName} looks created already.`)
    await createTimeEntry(didTaskCreated.task, dta, didTaskCreated.space)
  }

}

// review this for fortuna + apollo
const createTimeEntry = async (taskID, dta, space = 'MECL') => {
  // define team id according to the space that we retreived from the task
  var teamID = space != 'LS' ? CLICKUP_TEAMID_MECL : CLICKUP_TEAMID_LS

  var url = `https://api.clickup.com/api/v2/team/${teamID}/time_entries`
  var payload = {
    "description": dta.time_log_note,
    "start": dta.dateEpoch * 1000,
    "billable": true,
    "duration": dta.duration,
    "assignee": CLICKUP_USER,
    "tid": taskID
  }

  var params = {
    'method': 'POST',
    'muteHttpExceptions': true,
    'contentType': 'application/json',
    "headers": {
      "Content-Type": "application/json",
      "Authorization": CLICKUP_KEY
    }, "payload": JSON.stringify(payload)
  };

  var res = UrlFetchApp.fetch(url, params);
  var data = JSON.parse(res.getResponseCode());
  switch (data) {
    case 200:
      Logger.log(`Duration time entried to the Clickup for ${dta.taskName}`)
      await findRowByMeetingId(dta.UDID, 'Success', taskID)
      break;
    case 404 || 500:
      Logger.log('Time Entry failed')
      await findRowByMeetingId(dta.UDID, 'Failed', taskID)
      break;
    case 400:
      Logger.log('Access error')
      await findRowByMeetingId(dta.UDID, 'AUTH', taskID)
      break;
    default:
      Logger.log(data)
      await findRowByMeetingId(dta.UDID, 'ERROR', taskID)
  }
}

// Time log status is optional here to update timelogstatus' value
const findRowByMeetingId = async (id, timeLogStatus, taskID) => {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName('entries');
    var indexById = sheet.createTextFinder(id).findNext().getRowIndex();
    timeLogStatus ? sheet.getRange(`I${indexById}`).setValue(timeLogStatus) : '';
    taskID ? sheet.getRange(`L${indexById}`).setValue(`https://app.clickup.com/t/${taskID}`) : '';
    return {
      "status": true
    }

  } catch (err) {
    return {
      "status": false
    }
  }
}


const pushToArchive = () => {
  let total;
  var date = new Date()
  var formatted = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("entries");
  var resultRows = sheet.getLastRow();
  var range = sheet.getDataRange();
  var headers = sheet.getRange(`A1:N1`).getValues();
  for (var i = 2; i <= resultRows; i++) {
    var rowValues = sheet.getRange(`A${i}:L${i}`).getValues();

    rowValues[0].push(formatted)
    // setting total if the loggin succeeded
    if (rowValues[0][8] == 'Success') {
      total = total + rowValues[0][7] / 3600000
    }

    rowValues[0][7] = `${rowValues[0][7] / 3600000} hr`; // covert ms to hrs
    Logger.log(`${rowValues[0][1]} record pushed to Archive`)
    SpreadsheetApp.getActive().getSheetByName('archive').appendRow(rowValues[0])
  }
  Logger.log(`All records pushed to archive`)
  range.clearContent();
  SpreadsheetApp.getActive().getSheetByName('entries').appendRow(headers[0])
  slackNotifier(formatted, total)
  Logger.log(`Entries sheet cleared!`)
}


const slackNotifier = (date, total) => {

  let text;
  if (total > 0) {
    text = `Total Logged for ${date} is *${total}* hrs`
  } else {
    text = `No logging for today`
  }

  var payload = {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": text
        }
      }
    ]
  }

  var options = {
    "method": "post",
    "headers": {
      "Content-type": "application/json",
    },
    "payload": JSON.stringify(payload)
  };
  UrlFetchApp.fetch(SLACK_HOOK, options);
  Logger.log(`Slack notified as ${total} for ${date}`)
}



const titleController = async (title) => {

  /*
    Reference:
    relations = ['LS MINSK', 'MINSK', 'LEANSCALE', , 'LA3EB', 'MESTORES'];
    type = ['PERSONAL', 'WORK']
  */

  let data;
  switch (true) {
    case /apollo/.test(title):
      data = {
        "type": "WORK",
        "relations": "APOLLO"
      }
      break;
    case /fortuna/.test(title):
      data = {
        "type": "WORK",
        "relations": "FORTUNA"
      }
      break;
    case /ls minsk/.test(title):
      data = {
        "type": "PERSONAL",
        "relations": "LS MINSK"
      }
      break;
    case /ls/.test(title):
      data = {
        "type": "WORK",
        "relations": "LS"
      }
      break;
    case /mestores/.test(title):
      data = {
        "type": "WORK",
        "relations": "MESTORES"
      }
      break;
    case /unification/.test(title):
      data = {
        "type": "WORK",
        "relations": "MESTORES"
      }
      break;
    case /mu/.test(title): // shorter of mestores unification
      data = {
        "type": "WORK",
        "relations": "MESTORES"
      }
      break;
    case /ooo/.test(title):
      data = {
        "type": "PERSONAL",
        "relations": "AWAY"
      }
      break;
    case /paperwork/.test(title):
      data = {
        "type": "PERSONAL",
        "relations": "LS MINSK"
      }
      break;
    case /side/.test(title):
      data = {
        "type": "PERSONAL",
        "relations": "LEANSCALE"
      }
      break;
    default:
      data = {
        "type": "WORK",
        "relations": "MESTORES"
      }
  }

  return data;
}

const isTaskCreated = async (text) => {

  // Try to find Task id and space from the title with regexp
  result = /#([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/.exec(text)
  // if there is no space, try to catch only taskid
  if (result == null) {
    result = /#([a-zA-Z0-9]+)/.exec(text)
  }

  // finally, return true or false according to the task id
  if (result != null) {
    return {
      "status": true,
      "task": result[1],
      "space": result[2] ? result[2] : false
    }
  } else {
    return {
      "status": false
    }
  }

}

