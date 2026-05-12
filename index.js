const express = require('express');
const twilio = require('twilio');
const menu = require('./menu');

const app = express();
app.use(express.urlencoded({ extended: false }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const FROM_NUMBER = process.env.TWILIO_WHATSAPP_FROM;

const sessions = {};

function buildMenuMessage() {
  const lines = [`🍽️ *Welcome to ${menu.restaurantName}!*\n`];
  lines.push("Here's our menu:\n");
  for (const [num, item] of Object.entries(menu.items)) {
    lines.push(`${num}️⃣ ${item.name} — ${menu.currency}${item.price}`);
  }
  lines.push("\n📝 *How to order:*");
  lines.push("Reply with item numbers e.g. \"1, 3\"");
  lines.push("Type *DONE* to confirm your order.");
  lines.push("Type *MENU* anytime to see this again.");
  return lines.join("\n");
}

async function notifyOwner(customerNumber, orderedItems, total) {
  const itemList = orderedItems
    .map(num => `• ${menu.items[num].name} — ${menu.currency}${menu.items[num].price}`)
    .join("\n");
  const cleanNumber = customerNumber.replace("whatsapp:", "");
  const message =
    `🔔 *NEW ORDER!*\n\n` +
    `📱 Customer: ${cleanNumber}\n\n` +
    `🛒 *Order:*\n${itemList}\n\n` +
    `💰 *Total: ${menu.currency}${total}*\n\n` +
    `⏱️ Est. time: ${menu.estimatedTime}`;
  await client.messages.create({ from: FROM_NUMBER, to: menu.ownerWhatsApp, body: message });
}

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();
  const msg  = body?.toUpperCase();

  if (!sessions[from]) sessions[from] = { stage: 'start', items: [] };
  const session = sessions[from];
  let reply = '';

  try {
    if (msg === 'MENU' || msg === 'HI' || msg === 'HELLO' || msg === 'START' || session.stage === 'start') {
      session.stage = 'ordering';
      session.items = [];
      reply = buildMenuMessage();
    } else if (msg === 'DONE' && session.stage === 'ordering') {
      if (session.items.length === 0) {
        reply = "⚠️ No items added yet! Reply with item numbers e.g. \"1, 3\"";
      } else {
        const total = session.items.reduce((sum, n) => sum + menu.items[n].price, 0);
        const itemList = session.items.map(n => `• ${menu.items[n].name}`).join("\n");
        reply =
          `✅ *Order Confirmed!*\n\n${itemList}\n\n` +
          `💰 *Total: ${menu.currency}${total}*\n\n` +
          `⏱️ Ready in ${menu.estimatedTime}. Thank you! 🙏`;
        await notifyOwner(from, session.items, total);
        sessions[from] = { stage: 'start', items: [] };
      }
    } else if (session.stage === 'ordering') {
      const valid = Object.keys(menu.items);
      const selected = body.split(/[,\s]+/).map(s => s.trim()).filter(s => valid.includes(s));
      if (selected.length > 0) {
        session.items.push(...selected);
        const added = selected.map(n => `✅ ${menu.items[n].name}`).join("\n");
        const total = session.items.reduce((sum, n) => sum + menu.items[n].price, 0);
        reply = `Added:\n${added}\n\n🛒 *Running total: ${menu.currency}${total}*\n\nAdd more or type *DONE* to confirm.`;
      } else {
        reply = "⚠️ Invalid item. Please reply with numbers like \"1, 3\" or type *MENU*.";
      }
    } else {
      reply = "Type *HI* to start ordering! 👋";
    }
  } catch (err) {
    console.error(err);
    reply = "Something went wrong. Please try again.";
  }

  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`);
});

app.get('/', (req, res) => res.send('Bot is running ✅'));
app.listen(process.env.PORT || 3000, () => console.log('Bot started!'));