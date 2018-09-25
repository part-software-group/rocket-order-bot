const config = require('config');
const express = require('express');
const db = require('sqlite');
const Promise = require('bluebird');
const Request = require('request-promise');
const bodyParser = require('body-parser');

const port = config.get('server.http.port');

const app = express();
app.use(bodyParser.json());

let task = {
  name: null,
  db: {
    id: null,
    start: false,
  },
  rocket: {
    user: null,
  },
};

app.get('/posts', async (req, res, next) => {
  try {
    const posts = await db.all('SELECT * FROM person LIMIT 10');
    res.send(posts);
  } catch (err) {
    return next(err);
  }
});

app.post('/hook/rocket', async (req, res, next) => {
  console.log(req.body);

  const message = req.body.text.toLowerCase();
  if (req.body.hasOwnProperty('message') && req.body.message.hasOwnProperty('file')) {
    res.setHeader('Content-Type', 'application/json');
    res.send('{"status": "success"}');
    return;
  }
  let isSet = true;
  let isStart = false;
  const regex = {
    lunchListAddDate: /^\s*!lunch_list_add_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8})/,
    lunchListDeleteDate: /^\s*!lunch_list_delete_date\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}.[0-9]{2}.[0-9]{2}|[0-9]{4}\/[0-9]{2}\/[0-9]{2}|[0-9]{8})/,
  };
  switch (message) {
    case '!lunch_list_set':
      break;
    case '!end':
      await sendRocketSuccess('lunch_list_add_date');
      resetTask();
      break;
    default:
      if (!task.name || (task.name && task.rocket.user !== 't')) isSet = false;
  }

  if (!isSet) {
    const lunchListAddDate = regex.lunchListAddDate.exec(message);
    if (lunchListAddDate)
      if (!task.name) {
        task.name = 'lunchListAddDate';
        const selectDate = lunchListAddDate[1].replace(/[^0-9]+/, '');
        try {
          const result = await db.run(
            `INSERT INTO lunch_list (id, list, order_date, insert_date) VALUES (null, '', ?, ?)`,
            [selectDate, getDate()],
          );
          isStart = true;
          task.db.id = result.stmt.lastID;
        } catch (e) {
          await sendRocketFail('error', [
            {
              key: 'code',
              value: 'insert_lunch_list_add_date',
            },
            {
              key: 'database',
              value: e.message.toString(),
            },
          ]);
        }
      } else {
        await sendRocketWarning('lunch_list_add_date', [
          {
            key: 'اخطار',
            value: 'یک سفارش نهار در حال پردازش است! لطفا بعدا تلاش کنید.',
          },
        ]);
        isStart = true;
      }

    const lunchListDeleteDate = regex.lunchListDeleteDate.exec(message);
    if (lunchListDeleteDate)
      try {
        const selectDate = lunchListDeleteDate[1].replace(/[^0-9]+/, '');
        await db.run(`UPDATE lunch_list SET delete_date = ? WHERE order_date = ? AND delete_date = 0`, [
          getDate(),
          Number(selectDate),
        ]);
        await sendRocketSuccess('lunch_list_delete_date');
        resetTask();
      } catch (e) {
        await sendRocketFail('error', [
          {
            key: 'code',
            value: 'update_lunch_list_delete_date',
          },
          {
            key: 'database',
            value: e.message.toString(),
          },
        ]);
      }
  }

  if (!isStart)
    switch (task.name) {
      case 'lunchListAddDate':
        try {
          const list = task.db.start ? `list || '|' || '${message}'` : `'${message}'`;
          await db.run(`UPDATE lunch_list set list = ${list} WHERE id = ?`, [task.db.id]);
          task.db.start = true;
        } catch (e) {
          await sendRocketFail('error', [
            {
              key: 'code',
              value: 'update_lunch_list_add_date',
            },
            {
              key: 'database',
              value: e.message.toString(),
            },
          ]);
        }
        break;
    }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

function resetTask() {
  task = {
    name: null,
    db: {
      id: null,
      start: false,
    },
    rocket: {
      user: null,
    },
  };
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

async function sendRocketSuccess(command, args) {
  let body = {};
  switch (command) {
    case 'lunch_list_add_date':
      body = {
        channel: '@root',
        msg: 'سفارش نهار به درستی ثبت گردید',
        emoji: ':white_check_mark:',
      };
      break;
    case 'lunch_list_delete_date':
      body = {
        channel: '@root',
        msg: 'سفارش نهار به درستی حذف گردید',
        emoji: ':white_check_mark:',
      };
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

async function sendRocketWarning(command, args) {
  let body = {};
  switch (command) {
    case 'lunch_list_add_date':
      body = {
        channel: '@root',
        msg: 'خطا در افزودن سفارش نهار!',
        emoji: ':warning:',
      };
      break;
    case 'error':
      body = {
        channel: '@root',
        msg: 'Error: Fail execute code!',
        emoji: ':negative_squared_cross_mark:',
      };
  }

  if (args.length) {
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

async function sendRocketFail(command, args) {
  resetTask();
  let body = {};
  switch (command) {
    case 'lunch_list_add_date':
      body = {
        channel: '@root',
        msg: 'خطا در افزودن سفارش نهار!',
        emoji: ':negative_squared_cross_mark:',
      };
      break;
    case 'error':
      body = {
        channel: '@root',
        msg: 'Error: Fail execute code!',
        emoji: ':negative_squared_cross_mark:',
      };
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
  .then(() => db.open(config.get('database.order.file'), { Promise }))
  // Update db schema to the latest version using SQL-based migrations
  .then(() => db.migrate({ force: 'last', migrationsPath: './storage/database/migrations' }))
  // Finally, launch the Node.js app
  .finally(() => app.listen(port, () => console.log(`Example app listening on port ${port}!`)))
  // Display error message if something went wrong
  .catch((err) => console.error(err.stack));
