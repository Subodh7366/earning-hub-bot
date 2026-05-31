const TelegramBot = require("node-telegram-bot-api");
const db = require("./database");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID  = parseInt(process.env.ADMIN_ID);

const CHANNELS = [
  { name: "The Pocke Profit",  url: "https://t.me/thepockeprofit01",  id: "@thepockeprofit01" },
  { name: "Buy And Sell App",  url: "https://t.me/buyandsellapp01",   id: "@buyandsellapp01"  },
  { name: "Earn By Telegram",  url: "https://t.me/earnbytelegram1",   id: "@earnbytelegram1"  },
];

const SPIN_DISPLAY = [4, 5, 6, 10, 25, 50, 100];

function getSpinReward() {
  const rand = Math.random() * 100;
  if (rand < 45) return 4;
  if (rand < 80) return 5;
  if (rand < 97) return 6;
  return 10;
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

async function checkChannels(userId) {
  for (const ch of CHANNELS) {
    try {
      const member = await bot.getChatMember(ch.id, userId);
      if (member.status === "left" || member.status === "kicked") return false;
    } catch (e) { return false; }
  }
  return true;
}

function mainMenuKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "🎰 Spin & Win" }],
        [{ text: "👛 Wallet" }, { text: "👥 Invite" }],
        [{ text: "💸 Withdraw" }],
      ],
      resize_keyboard: true,
    },
  };
}

bot.onText(/\/start(.*)/, async (msg, match) => {
  const userId   = msg.from.id;
  const username = msg.from.username || msg.from.first_name;
  const refParam = match[1].trim();

  const isNew = db.registerUser(userId, username);

  if (isNew && refParam.startsWith("ref_")) {
    const referrerId = parseInt(refParam.replace("ref_", ""));
    if (referrerId && referrerId !== userId) {
      const joined = await checkChannels(userId);
      if (joined) {
        db.addReferralSpin(referrerId);
        bot.sendMessage(referrerId, `🎉 *Aapke referral ne bot join kar liya!*\nEk extra spin mila! 🎰`, { parse_mode: "Markdown" });
      } else {
        db.setPendingReferrer(userId, referrerId);
      }
    }
  }

  await bot.sendMessage(userId,
    `🎉 *Earning Hub Bot mein Swagat Hai!*\n\n💰 Spin karo, paisa kamao!\n\n*Pehle teeno channels join karo:*`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "1️⃣ The Pocke Profit",  url: "https://t.me/thepockeprofit01" }],
          [{ text: "2️⃣ Buy And Sell App",  url: "https://t.me/buyandsellapp01"  }],
          [{ text: "3️⃣ Earn By Telegram",  url: "https://t.me/earnbytelegram1"  }],
          [{ text: "✅ Maine Sab Join Kar Liya — Verify Karo", callback_data: "verify" }],
        ],
      },
    }
  );
});

bot.on("callback_query", async (query) => {
  const userId = query.from.id;
  const data   = query.data;

  if (data === "verify") {
    await bot.answerCallbackQuery(query.id, { text: "⏳ Check ho raha hai..." });
    const joined = await checkChannels(userId);
    if (!joined) {
      return bot.sendMessage(userId, `❌ *Teeno channels join nahi kiye!*\nPehle join karo phir verify karo.`, { parse_mode: "Markdown" });
    }
    const pendingRef = db.getPendingReferrer(userId);
    if (pendingRef) {
      db.addReferralSpin(pendingRef);
      db.clearPendingReferrer(userId);
      bot.sendMessage(pendingRef, `🎉 *Referral ne channels join kar liye!*\nEk extra spin mila! 🎰`, { parse_mode: "Markdown" });
    }
    db.setVerified(userId);
    await bot.sendMessage(userId, `✅ *Verification Successful!*\n\n🎰 Ab Spin & Win khelo!`, { parse_mode: "Markdown", ...mainMenuKeyboard() });
  }

  if (data === "do_spin") {
    await bot.answerCallbackQuery(query.id, { text: "🎰 Spinning..." });
    const user = db.getUser(userId);
    if (!user || !user.verified) return bot.sendMessage(userId, "❌ Pehle verify karo!");
    if (user.spins <= 0) {
      return bot.sendMessage(userId, `😔 *Koi spin nahi hai!*\n\n👥 Dosto ko refer karo — har referral pe 1 spin milega!`, { parse_mode: "Markdown" });
    }
    const reward = getSpinReward();
    db.useSpin(userId, reward);
    const updated = db.getUser(userId);
    const wheel = SPIN_DISPLAY.map(n => n === reward ? `*[₹${n}]* ◀️` : `₹${n}`).join("  |  ");
    await bot.sendMessage(userId,
      `🎰 *SPIN & WIN!*\n\n${wheel}\n\n🎊 *Badhai ho! ₹${reward} mila!*\n\n💰 Balance: ₹${updated.balance}\n🎰 Baaki Spins: ${updated.spins}`,
      { parse_mode: "Markdown" }
    );
  }

  if (data.startsWith("withdraw_confirm_")) {
    const upiId = data.replace("withdraw_confirm_", "");
    const user  = db.getUser(userId);
    if (!user || user.balance < 20) return bot.answerCallbackQuery(query.id, { text: "❌ Balance kam hai!" });
    const amount = user.balance;
    const reqId  = db.createWithdrawal(userId, amount, upiId);
    await bot.answerCallbackQuery(query.id, { text: "✅ Request submit!" });
    await bot.sendMessage(userId, `✅ *Withdrawal Request Submit!*\n\n💸 Amount: ₹${amount}\n📱 UPI: ${upiId}\n🔢 ID: #${reqId}\n\n⏳ Admin payment karega jald hi.`, { parse_mode: "Markdown" });
    await bot.sendMessage(ADMIN_ID,
      `💸 *NEW WITHDRAWAL*\n\n🔢 ID: #${reqId}\n👤 @${user.username} (${userId})\n💰 ₹${amount}\n📱 ${upiId}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: `✅ Approve ₹${amount}`, callback_data: `admin_approve_${reqId}` },
            { text: `❌ Reject`,              callback_data: `admin_reject_${reqId}`  },
          ]],
        },
      }
    );
  }

  if (data.startsWith("admin_approve_") && userId === ADMIN_ID) {
    const reqId = parseInt(data.replace("admin_approve_", ""));
    const req   = db.getWithdrawal(reqId);
    if (!req || req.status !== "pending") return bot.answerCallbackQuery(query.id, { text: "Already processed!" });
    db.approveWithdrawal(reqId);
    await bot.answerCallbackQuery(query.id, { text: "✅ Approved!" });
    bot.sendMessage(ADMIN_ID, `✅ Request #${reqId} approved!`);
    bot.sendMessage(req.user_id, `🎉 *Payment Ho Gayi!*\n\n✅ ₹${req.amount} UPI pe bhej diya!\n📱 ${req.upi_id}\n\n💰 Naya Balance: ₹${db.getUser(req.user_id).balance}`, { parse_mode: "Markdown" });
  }

  if (data.startsWith("admin_reject_") && userId === ADMIN_ID) {
    const reqId = parseInt(data.replace("admin_reject_", ""));
    const req   = db.getWithdrawal(reqId);
    if (!req || req.status !== "pending") return bot.answerCallbackQuery(query.id, { text: "Already processed!" });
    db.rejectWithdrawal(reqId);
    bot.answerCallbackQuery(query.id, { text: "❌ Rejected." });
    bot.sendMessage(ADMIN_ID, `❌ Request #${reqId} reject kar di.`);
    bot.sendMessage(req.user_id, `❌ *Withdrawal Reject Ho Gayi*\n\nRequest #${reqId} reject ho gayi.\nBalance safe hai.\n\nAdmin se contact karo.`, { parse_mode: "Markdown" });
  }

  if (data === "cancel_withdraw") {
    await bot.answerCallbackQuery(query.id, { text: "Cancelled!" });
    bot.sendMessage(userId, "❌ Withdrawal cancel ho gayi.", mainMenuKeyboard());
  }
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const userId = msg.from.id;
  const text   = msg.text.trim();

  const user = db.getUser(userId);
  if (!user) return bot.sendMessage(userId, "Pehle /start karo!");
  if (!user.verified) return bot.sendMessage(userId, "❌ Pehle channels join karke ✅ Verify karo!\n\n/start dabao.");

  if (text === "🎰 Spin & Win") {
    if (user.spins <= 0) {
      return bot.sendMessage(userId, `😔 *Koi Spin Nahi!*\n\n🎰 Spins: 0\n\n👥 Dosto ko refer karo!`, { parse_mode: "Markdown" });
    }
    const wheel = SPIN_DISPLAY.map(n => `₹${n}`).join("  ·  ");
    await bot.sendMessage(userId,
      `🎰 *SPIN & WIN!*\n\n🎡 ${wheel}\n\n🎰 Aapke Spins: ${user.spins}\n\nButton dabao!`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🎰 SPIN KARO!", callback_data: "do_spin" }]] } }
    );
  }

  if (text === "👛 Wallet") {
    await bot.sendMessage(userId,
      `👛 *Aapka Wallet*\n\n💰 Balance: ₹${user.balance}\n🎰 Spins: ${user.spins}\n👥 Referrals: ${user.referrals}\n\n📌 Min Withdrawal: ₹20`,
      { parse_mode: "Markdown" }
    );
  }

  if (text === "👥 Invite") {
   const botInfo = await bot.getMe();
    const link = `https://t.me/${botInfo.username}?start=ref_${userId}`;
    await bot.sendMessage(
      userId,
      `👥 *Invite Karo, Spin Kamao!*\n\n🎁 Har referral = 1 extra spin!\n\n🔗 *Tumhara Link:*\n${link}\n\n👥 Total Referrals: ${user.referrals}`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  }

  if (text === "💸 Withdraw") {
    if (user.balance < 20) {
      return bot.sendMessage(userId,
        `❌ *Balance Kam Hai!*\n\n💰 Balance: ₹${user.balance}\n📌 Min: ₹20\n\n₹${20 - user.balance} aur chahiye!`,
        { parse_mode: "Markdown" }
      );
    }
    db.setAwaitingUpi(userId, true);
    await bot.sendMessage(userId,
      `💸 *Withdrawal — ₹${user.balance}*\n\n📱 Apna UPI ID type karo:\n(example: name@paytm)`,
      { parse_mode: "Markdown", reply_markup: { force_reply: true } }
    );
  }

  if (db.isAwaitingUpi(userId) && text !== "💸 Withdraw") {
    db.setAwaitingUpi(userId, false);
    if (!text.includes("@")) {
      return bot.sendMessage(userId, `❌ Invalid UPI ID!\nExample: name@paytm\n\nDobara 💸 Withdraw dabao.`);
    }
    await bot.sendMessage(userId,
      `💸 *Confirm Karo*\n\n💰 Amount: ₹${user.balance}\n📱 UPI: ${text}\n\nSahi hai?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ Haan Withdraw Karo", callback_data: `withdraw_confirm_${text}` },
            { text: "❌ Cancel",              callback_data: "cancel_withdraw"           },
          ]],
        },
      }
    );
  }
});

console.log("✅ Earning Hub Bot chal raha hai...");
