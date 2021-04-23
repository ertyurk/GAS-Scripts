const CLICKUP_KEY = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config").getRange("C5:C5").getValue()
const CLICKUP_USER = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config").getRange("C6:C6").getValue()
const CLICKUP_TEAMID = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config").getRange("C7:C7").getValue()
const TARGET_ORDER_STATUS = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config").getRange("C8:C8").getValue()
const CLICKUP_TASKFORCE_LIST_ID = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config").getRange("C9:C9").getValue()
const CLICKUP_MESTORES_LIST_ID = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("config").getRange("C10:C10").getValue()
const onOpen = () => {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Event menu')
    .addItem('Get Calendar Entries', 'copyMeetingsFromCalendartoGoogleSheet')
    .addItem('🚀  -  Push Time Logs', 'entryController')
    .addToUi();
}
const entryController = async () => {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("entries");
  var resultRows = sheet.getLastRow();
  for (var i = 2; i <= resultRows; i++) {
    var rowValues = sheet.getRange(`A${i}:K${i}`).getValues();
    rowValues.forEach(cell => {
      if (cell[8] == 'Pending' && cell[4] == "WORK" || cell[3]== "AWAY") {
        var taskStartDate = new Date(cell[5]).getTime() / 1000;

        var dta = {
          "taskName": cell[1],
          "taskDescription": cell[2],
          "duration": cell[7],
          "dateEpoch": taskStartDate,
          "UDID": cell[0],
          "relations": cell[3],
          "tag": cell[9],
          'time_log_note': cell[10]
        }

        var today = new Date().getTime() / 1000;
        if (today > taskStartDate) {
          switch (dta.relations) {
            case ('MESTORES'):
              createClickUpTask(dta, CLICKUP_MESTORES_LIST_ID)
              break;
            case ('LA3EB'):
              createClickUpTask(dta, CLICKUP_TASKFORCE_LIST_ID)
              break;
            case ('LS MINSK'):
              Logger.log('LS MINSK')
              break;
            case ('AWAY'):
              Logger.log('Away')
              findRowByMeetingId(dta.UDID, 'Passed')
              
              break;
            default:
              createClickUpTask(dta, CLICKUP_TASKFORCE_LIST_ID)
          }
        } else {
          Logger.log(`Task did not finish yet.`)
        }
      }
    });
  }
}

const copyMeetingsFromCalendartoGoogleSheet = async () => {
  var today = new Date();
  var events = CalendarApp.getDefaultCalendar().getEventsForDay(today);
  Logger.log('Number of events: ' + events.length);
  for (var i = 0; i < events.length; i++) {
    var rel_data = await titleController(events[i].getTitle().toLowerCase());
    var duration = (new Date(events[i].getEndTime()).getTime()) - (new Date(events[i].getStartTime()).getTime())
    var findRowByMeetingIdResult = await findRowByMeetingId(events[i].getId())
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
      'Automated Timelog',
      'Automated Timelog Note',
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
        findRowByMeetingIdResult.status == false
          ? SpreadsheetApp.getActive().getSheetByName('entries').appendRow(result) : ''
    }
  }
}

const titleController = async (title) => {

  /*
    Reference:
    relations = ['LS MINSK', 'MINSK', 'LEANSCALE', , 'LA3EB', 'MESTORES'];
    type = ['PERSONAL', 'WORK']
  */

  let data;
  switch (true) {
    case /ls minsk/.test(title):
      data = {
        "type": "PERSONAL",
        "relations": "LS MINSK"
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
        "relations": "LA3EB"
      }
  }

  return data;
}

const createClickUpTask = async (dta, list_id) => {
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

  var res = await UrlFetchApp.fetch(url, params);
  var data = JSON.parse(res.getContentText());
  var header = JSON.parse(res.getResponseCode());
  switch (header) {
    case 404 || 500:
      Logger.log('Task creation failed')
    default:
      await createTimeEntry(data.id, dta)
  }

}

const createTimeEntry = async (taskID, dta) => {
  var url = `https://api.clickup.com/api/v2/team/${CLICKUP_TEAMID}/time_entries`
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

  var res = await UrlFetchApp.fetch(url, params);
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