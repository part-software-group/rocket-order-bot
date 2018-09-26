const bodyParser = require('body-parser');
const config = require('config');
const sqlite = require('sqlite');
const Excel = require('xlsx');
const express = require('express');
const Promise = require('bluebird');
const Request = require('request-promise');
/**
 * @property unlinkAsync
 */
const fs = Promise.promisifyAll(require('fs'));

const port = config.get('server.http.port');

const app = express();
app.use(bodyParser.json());

app.get('/posts', async (req, res, next) => {
  try {
    const posts = await sqlite.all('SELECT * FROM person LIMIT 10');
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
    if (fileName.match(/^lunch_list_add_date.*/g)) downloadExcelLunch(req.body.user_name, fileId, fileName);
    if (fileName.match(/^person_list_add.*/g)) downloadExcelUser(req.body.user_name, fileId, fileName);

    res.setHeader('Content-Type', 'application/json');
    res.send('{"status": "success"}');
    return;
  }
  const regex = {
    lunchListGet: /^\s*!lunch_list_get/,
    lunchListGetDate: /^\s*!lunch_list_get_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8}|[0-9]{2})/,
    lunchListAddDate: /^\s*!lunch_list_add_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8}|[0-9]{2})\s(.+)/,
    lunchListDeleteDate: /^\s*!lunch_list_delete_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8}|[0-9]{2}|all)/,
    lunchTomorrow: /^\s*!lunch_tomorrow\s(no|pick)\s([a-z0-9-]+)\s([0-9]+)\s(.+)/,
  };

  let selectDate;
  let selectList;
  const lunchListGet = regex.lunchListGet.exec(message);
  const lunchListGetDate = regex.lunchListGetDate.exec(message);
  const lunchListAddDate = regex.lunchListAddDate.exec(message);
  const lunchListDeleteDate = regex.lunchListDeleteDate.exec(message);
  const lunchTomorrow = regex.lunchTomorrow.exec(message);

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
    case Boolean(lunchTomorrow):
      updateLunchTomorrow(lunchTomorrow[1], lunchTomorrow[2], lunchTomorrow[3], lunchTomorrow[4], req.body.user_name);
      break;
  }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

function downloadExcel(fileId, fileName) {
  return Request({
    method: 'get',
    url: `${config.get('custom.rocket.url')}/file-upload/${fileId}/${fileName}`,
    headers: {
      Cookie: 'rc_uid=y79MateTAAr3LEz6E; rc_token=iz7eRC-_zr6lGxFryjfRdyb9HBvOt44cSMwaD_5GB7P',
    },
  });
}

function downloadExcelLunch(username, fileId, fileName) {
  const file = `./storage/temp/${fileId}_${fileName}`;
  const req = downloadExcel(fileId, fileName);

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
      const wb = Excel.readFile(file);
      const result = Excel.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const data = {
        text: [],
        param: [],
      };

      for (let i = 1; i < result.length; i++) {
        if (result[i].length < 2) continue;

        data.text.push(`(null, ?, ?, ?)`);
        const [selectDate, ...selectList] = result[i];
        data.param.push(selectDate.replace(/[^0-9]+/, ''));
        data.param.push(selectList.join('|'));
        data.param.push(getDate());
      }

      if (!data.text.length)
        return Promise.all([sendRocketWarning('excel_lunch_list_add_date', username), fs.unlinkAsync(file)]);

      Promise.all([
        sqlite.run(`UPDATE lunch_list SET delete_date = ? WHERE delete_date = 0`, [getDate()]),
        sqlite.run(
          `INSERT INTO lunch_list (id, order_date, list, insert_date) VALUES ${data.text.join(', ')}`,
          data.param,
        ),
      ])
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

function downloadExcelUser(username, fileId, fileName) {
  const file = `./storage/temp/${fileId}_${fileName}`;
  const req = downloadExcel(fileId, fileName);

  req
    .on('error', (error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'download_person_list_add',
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
      const wb = Excel.readFile(file);
      const result = Excel.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const data = {
        text: [],
        param: [],
      };

      for (let i = 1; i < result.length; i++) {
        if (!result[i].length) continue;

        data.text.push(`(null, ?, ?)`);
        data.param.push(result[i][0]);
        data.param.push(getDate());
      }

      if (!data.text.length)
        return Promise.all([sendRocketWarning('excel_person_list_add', username), fs.unlinkAsync(file)]);

      Promise.all([
        sqlite.run(`UPDATE person SET delete_date = ? WHERE delete_date = 0`, [getDate()]),
        sqlite.run(`INSERT INTO person (id, username, insert_date) VALUES ${data.text.join(', ')}`, data.param),
      ])
        .then(() => fs.unlinkAsync(file))
        .then(() => sendRocketSuccess('person_list_add', username))
        .catch((error) =>
          sendRocketFail('error', username, [
            {
              key: 'code',
              value: 'excel_person_list_add',
            },
            {
              key: 'database',
              value: error.message.toString(),
            },
          ]),
        );
    });
}

function getLunchList(username) {
  sqlite
    .all(`SELECT order_date, list FROM lunch_list WHERE delete_date = 0`)
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
  sqlite
    .all(`SELECT order_date, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [selectDate])
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
  sqlite
    .run(`INSERT INTO lunch_list (id, order_date, list, insert_date) VALUES (null, ?, ?, ?)`, [
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
  sqlite
    .run(`UPDATE lunch_list SET delete_date = ? WHERE order_date = ? AND delete_date = 0`, [
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

function updateLunchTomorrow(type, oid, listRowId, lunch, username) {
  let rocketMessageId;
  let rocketRoomId;
  sqlite
    .all(`SELECT lunch_list_id, rocket_message_id, rocket_room_id FROM lunch_order WHERE id = ?`, [oid])
    .then((data) => {
      /**
       * @property lunch_list_id
       */
      if (!data.length) return sendRocketFail('lunch_tomorrow', username);
      else if (data.length && data[0].lunch_list_id) return sendRocketWarning('lunch_tomorrow', username);

      // noinspection JSUnresolvedVariable
      rocketMessageId = data[0].rocket_message_id;
      // noinspection JSUnresolvedVariable
      rocketRoomId = data[0].rocket_room_id;
      return sqlite.run(`UPDATE lunch_order SET lunch_list_id = ?, lunch = ? WHERE id = ? AND lunch_list_id ISNULL`, [
        listRowId,
        lunch,
        oid,
      ]);
    })
    .then((data) => {
      if (!data) return;

      return Request({
        method: 'post',
        url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.delete`,
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'y79MateTAAr3LEz6E',
          'X-Auth-Token': 'iz7eRC-_zr6lGxFryjfRdyb9HBvOt44cSMwaD_5GB7P',
        },
        body: {
          roomId: rocketRoomId,
          msgId: rocketMessageId,
          asUser: true,
        },
        json: true,
      });
    })
    .then((data) => (data ? sendRocketSuccess('lunch_tomorrow', username) : null))
    .catch((error) =>
      sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'update_lunch_tomorrow',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
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
  body.emoji = ':white_check_mark:';
  switch (command) {
    case 'lunch_list_add_date':
      body.msg = 'سفارش نهار به درستی ثبت گردید';
      break;
    case 'lunch_list_delete_date':
      body.msg = 'سفارش نهار به درستی حذف گردید';
      break;
    case 'lunch_list_get':
      delete body.emoji;
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
    case 'person_list_add':
      body.msg = 'کاربر به درستی ثبت گردید';
      break;
    case 'lunch_tomorrow':
      body.msg =
        'سفارش شما برای فردا ثبت شد.\n\n*درصورتی که می‌خواهید انتخاب خود را تغییر دهید به پشتیبانی مراجعه کنید.*';
      break;
  }

  try {
    await Request({
      method: 'post',
      url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'y79MateTAAr3LEz6E',
        'X-Auth-Token': 'iz7eRC-_zr6lGxFryjfRdyb9HBvOt44cSMwaD_5GB7P',
      },
      body,
      json: true,
    });
  } catch (e) {
    console.log(e);
  }
}

async function sendRocketWarning(command, user, args) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  body.emoji = ':warning:';
  switch (command) {
    case 'excel_lunch_list_add_date':
    case 'excel_person_list_add':
      body.msg = 'هیچ داده‌ای در اکسل برای افزودن وجود ندارد!';
      break;
    case 'lunch_tomorrow':
      body.msg = 'شما قبلا غذا ثبت کرده‌اید! لطفا برای ثبت مجدد با پشتبیانی در تماس باشد.';
      break;
  }

  if (args && args.length) {
    body.attachments = [];
    body.attachments.push({
      color: 'yellow',
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
        'X-User-Id': 'y79MateTAAr3LEz6E',
        'X-Auth-Token': 'iz7eRC-_zr6lGxFryjfRdyb9HBvOt44cSMwaD_5GB7P',
      },
      body,
      json: true,
    });
  } catch (e) {
    console.log(e);
  }
}

async function sendRocketFail(command, user, args) {
  const body = {};
  body.channel = user.substr(0, 1) !== '@' ? `@${user}` : user;
  body.emoji = ':negative_squared_cross_mark:';
  switch (command) {
    case 'lunch_list_add_date':
      body.msg = 'خطا در افزودن سفارش نهار!';
      break;
    case 'lunch_tomorrow':
      body.msg = 'چنین سفارشی وجود ندارد!';
      break;
    case 'error':
      body.msg = 'خطا در اجرا کد!';
      break;
  }

  if (args && args.length) {
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
        'X-User-Id': 'y79MateTAAr3LEz6E',
        'X-Auth-Token': 'iz7eRC-_zr6lGxFryjfRdyb9HBvOt44cSMwaD_5GB7P',
      },
      body,
      json: true,
    });
  } catch (e) {
    console.log(e);
  }
}

Promise.resolve()
  .then(() => sqlite.open(config.get('database.order.file'), { Promise }))
  // Update db schema to the latest version using SQL-based migrations
  .then(() => sqlite.migrate({ force: 'last', migrationsPath: './storage/database/migrations' }))
  // Finally, launch the Node.js app
  .finally(() =>
    app.listen(port, () => {
      require('./lib/schedule')(sqlite);
      console.log(`Example app listening on port ${port}!`);
    }),
  )
  // Display error message if something went wrong
  .catch((err) => console.error(err.stack));
