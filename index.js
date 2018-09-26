const Xlsx = require('xlsx');
const config = require('config');
const express = require('express');
const db = require('sqlite');
const Promise = require('bluebird');
const Request = require('request-promise');
const bodyParser = require('body-parser');
/**
 * @property unlinkAsync
 */
const fs = Promise.promisifyAll(require('fs'));

const port = config.get('server.http.port');

const app = express();
app.use(bodyParser.json());

app.get('/posts', async (req, res, next) => {
  try {
    const posts = await db.all('SELECT * FROM person LIMIT 10');
    res.send(posts);
  } catch (err) {
    return next(err);
  }
});

app.post('/hook/rocket', async (req, res) => {
  console.log(req.body);
  /**
   * @property _id
   * @property user_name
   */
  const message = req.body.text.toLowerCase();
  if (req.body.hasOwnProperty('message') && req.body.message.hasOwnProperty('file')) {
    const fileId = req.body.message.file._id;
    const fileName = req.body.message.file.name;
    if (fileName.match(/^lunch_list_add_date.*/g)) downloadExcel(req.body.user_name, fileId, fileName);

    res.setHeader('Content-Type', 'application/json');
    res.send('{"status": "success"}');
    return;
  }
  const regex = {
    lunchListGet: /^\s*!lunch_list_get/,
    lunchListGetDate: /^\s*!lunch_list_get_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8})/,
    lunchListAddDate: /^\s*!lunch_list_add_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8})\s(.+)/,
    lunchListDeleteDate: /^\s*!lunch_list_delete_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8}|all)/,
  };

  let selectDate;
  let selectList;
  const lunchListGet = regex.lunchListGet.exec(message);
  const lunchListGetDate = regex.lunchListGetDate.exec(message);
  const lunchListAddDate = regex.lunchListAddDate.exec(message);
  const lunchListDeleteDate = regex.lunchListDeleteDate.exec(message);
  switch (true) {
    case Boolean(lunchListGet):
      getLunchList(req.body.user_name);
      break;
    case Boolean(lunchListGetDate):
      selectDate = lunchListGetDate[1].replace(/[^0-9]+/, '');
      getLunchListDate(selectDate, req.body.user_name);
      break;
    case Boolean(lunchListAddDate):
      selectDate = lunchListAddDate[1].replace(/[^0-9]+/, '');
      selectList = lunchListAddDate[2]
        .split(/\s(?=(?:[^"']|"[^"]*")*$)/g)
        .map((v) => (v.substr(0, 1) === '"' ? v.substr(1).slice(0, -1) : v))
        .join('|');
      addLunchListDate(selectDate, selectList, req.body.user_name);
      break;
    case Boolean(lunchListDeleteDate):
      selectDate = lunchListDeleteDate[1].replace(/[^0-9]+/, '');
      deleteLunchListDate(selectDate, req.body.user_name);
      break;
  }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

function getLunchList(username) {
  db.all(`SELECT order_date, list FROM lunch_list WHERE delete_date = 0`)
    .then((data) => sendRocketSuccess('lunch_list_get', username, [data]))
    .catch((error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'select_lunch_list_get',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function getLunchListDate(selectDate, username) {
  db.all(`SELECT order_date, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [selectDate])
    .then((data) => sendRocketSuccess('lunch_list_get', username, [data]))
    .catch((error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'select_lunch_list_get_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function addLunchListDate(selectDate, selectList, username) {
  db.run(`INSERT INTO lunch_list (id, order_date, list, insert_date) VALUES (null, ?, ?, ?)`, [
    selectDate,
    selectList,
    getDate(),
  ])
    .then(() => sendRocketSuccess('lunch_list_add_date', username))
    .catch((error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'insert_lunch_list_add_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function deleteLunchListDate(selectDate, username) {
  db.run(`UPDATE lunch_list SET delete_date = ? WHERE order_date = ? AND delete_date = 0`, [
    getDate(),
    Number(selectDate),
  ])
    .then(() => sendRocketSuccess('lunch_list_delete_date', username))
    .catch((error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'update_lunch_list_delete_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function downloadExcel(username, fileId, fileName) {
  const req = Request({
    method: 'get',
    url: `${config.get('custom.rocket.url')}/file-upload/${fileId}/${fileName}`,
    headers: {
      Cookie: 'rc_uid=hXX753szzaEcWzc5k; rc_token=BGT9z3k9wSnAuiHF3ZBnkHF-rXWoxDgL0ldP51N14Id',
    },
  });

  const file = `./storage/temp/${fileId}_${fileName}`;
  req
    .on('error', (error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'download_lunch_list_add_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    // eslint-disable-next-line
    .pipe(fs.createWriteStream(file))
    .on('close', () => {
      // eslint-disable-next-line
      const wb = Xlsx.readFile(file);
      const result = Xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const data = {
        text: [],
        param: [],
      };
      for (let i = 0; i < result.length; i++) {
        data.text.push(`(null, ?, ?, ?)`);
        const [selectDate, ...selectList] = result[i];
        data.param.push(selectDate);
        data.param.push(selectList.join('|'));
        data.param.push(getDate());
      }

      db.run(`INSERT INTO lunch_list (id, order_date, list, insert_date) VALUES ${data.text.join(', ')}`, data.param)
        .then(() => fs.unlinkAsync(file))
        .then(() => sendRocketSuccess('lunch_list_add_date', username))
        .catch((error) =>
          sendRocketFail('error', username, [
            {
              key: 'code',
              value: 'excel_lunch_list_delete_date',
            },
            {
              key: 'database',
              value: error.message.toString(),
            },
          ]),
        );
    });
}

function getDate() {
  const datePick = new Date();
  const year = datePick.getFullYear();
  const month = (datePick.getMonth() + 1).toString().padStart(2, '0');
  const day = datePick
    .getDate()
    .toString()
    .padStart(2, '0');
  const hours = datePick
    .getHours()
    .toString()
    .padStart(2, '0');
  const minutes = datePick
    .getMinutes()
    .toString()
    .padStart(2, '0');
  const seconds = datePick
    .getSeconds()
    .toString()
    .padStart(2, '0');
  const milliseconds = datePick
    .getMilliseconds()
    .toString()
    .padEnd(3, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
}

async function sendRocketSuccess(command, user, args) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  switch (command) {
    case 'lunch_list_add_date':
      body.msg = 'سفارش نهار به درستی ثبت گردید';
      body.emoji = ':white_check_mark:';
      break;
    case 'lunch_list_delete_date':
      body.msg = 'سفارش نهار به درستی حذف گردید';
      body.emoji = ':white_check_mark:';
      break;
    case 'lunch_list_get':
      body.msg = 'لیست ناهار:';
      body.attachments = [];
      for (let i = 0; i < args[0].length; i++) {
        body.attachments.push({
          color: 'green',
          text: `تاریخ *${args[0][i].order_date}*`,
          fields: [],
        });
        switch (args[0][i].order_date) {
          case 10:
            body.attachments[i].text = `هفته فرد *شنبه*`;
            break;
          case 11:
            body.attachments[i].text = `هفته فرد *یکشنبه*`;
            break;
          case 12:
            body.attachments[i].text = `هفته فرد *دوشنبه*`;
            break;
          case 13:
            body.attachments[i].text = `هفته فرد *سه‌شنبه*`;
            break;
          case 14:
            body.attachments[i].text = `هفته فرد *چهارشنبه*`;
            break;
          case 20:
            body.attachments[i].text = `هفته زوج *شنبه*`;
            break;
          case 21:
            body.attachments[i].text = `هفته زوج *یکشنبه*`;
            break;
          case 22:
            body.attachments[i].text = `هفته زوج *دوشنبه*`;
            break;
          case 23:
            body.attachments[i].text = `هفته زوج *سه‌شنبه*`;
            break;
          case 24:
            body.attachments[i].text = `هفته زوج *چهارشنبه*`;
            break;
          default:
            body.attachments[i].text = `تاریخ *${args[0][i].order_date}*`;
        }
        args[0][i].list.split(/\|/g).map((v) => body.attachments[i].fields.push({ value: v, short: true }));
      }
      break;
  }

  try {
    await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'hXX753szzaEcWzc5k',
        'X-Auth-Token': 'BGT9z3k9wSnAuiHF3ZBnkHF-rXWoxDgL0ldP51N14Id',
      },
      body,
      json: true,
    });
  } catch (e) {
    console.log(e);
  }
}

// async function sendRocketWarning(command, args) {
//   let body = {};
//   switch (command) {
//     case 'lunch_list_add_date':
//       body = {
//         channel: '@admin',
//         msg: 'خطا در افزودن سفارش نهار!',
//         emoji: ':warning:',
//       };
//       break;
//     case 'error':
//       body = {
//         channel: '@admin',
//         msg: 'Error: Fail execute code!',
//         emoji: ':negative_squared_cross_mark:',
//       };
//   }
//
//   if (args.length) {
//     body.attachments = [];
//     body.attachments.push({
//       color: 'yellow',
//       fields: [],
//     });
//
//     for (let i = 0; i < args.length; i++)
//       body.attachments[0].fields.push({
//         short: false,
//         title: args[i].key,
//         value: args[i].value,
//       });
//   }
//
//   try {
//     await Request({
//       method: 'post',
//       url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
//       headers: {
//         'Content-Type': 'application/json',
//         'X-User-Id': 'hXX753szzaEcWzc5k',
//         'X-Auth-Token': 'BGT9z3k9wSnAuiHF3ZBnkHF-rXWoxDgL0ldP51N14Id',
//       },
//       body,
//       json: true,
//     });
//   } catch (e) {
//     console.log(e);
//   }
// }

async function sendRocketFail(command, user, args) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  body.emoji = ':negative_squared_cross_mark:';
  switch (command) {
    case 'lunch_list_add_date':
      body.msg = 'خطا در افزودن سفارش نهار!';
      break;
    case 'error':
      body.msg = 'خطا در اجرا کد!';
      break;
  }

  if (args.length) {
    body.attachments = [];
    body.attachments.push({
      color: 'red',
      fields: [],
    });

    for (let i = 0; i < args.length; i++)
      body.attachments[0].fields.push({
        short: false,
        title: args[i].key,
        value: args[i].value,
      });
  }

  try {
    await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'hXX753szzaEcWzc5k',
        'X-Auth-Token': 'BGT9z3k9wSnAuiHF3ZBnkHF-rXWoxDgL0ldP51N14Id',
      },
      body,
      json: true,
    });
  } catch (e) {
    console.log(e);
  }
}

Promise.resolve()
  .then(() => db.open(config.get('database.order.file'), { Promise }))
  // Update db schema to the latest version using SQL-based migrations
  .then(() => db.migrate({ force: 'last', migrationsPath: './storage/database/migrations' }))
  // Finally, launch the Node.js app
  .finally(() => app.listen(port, () => console.log(`Example app listening on port ${port}!`)))
  // Display error message if something went wrong
  .catch((err) => console.error(err.stack));
