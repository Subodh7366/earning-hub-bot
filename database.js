const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "data.json");

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const init = { users: {}, withdrawals: [], nextReqId: 1 };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function registerUser(userId, username) {
  const db = loadDB();
  const id = String(userId);
  if (db.users[id]) return false;
  db.users[id] = {
    userId, username,
    verified: false,
    balance: 0,
    spins: 1,
    referrals: 0,
    awaitingUpi: false,
    pendingReferrer: null,
  };
  saveDB(db);
  return true;
}

function getUser(userId) {
  const db = loadDB();
  return db.users[String(userId)] || null;
}

function setVerified(userId) {
  const db = loadDB();
  const u = db.users[String(userId)];
  if (u) { u.verified = true; saveDB(db); }
}

function addReferralSpin(referrerId) {
  const db = loadDB();
  const u = db.users[String(referrerId)];
  if (u) { u.spins += 1; u.referrals += 1; saveDB(db); }
}

function useSpin(userId, reward) {
  const db = loadDB();
  const u = db.users[String(userId)];
  if (u) { u.spins = Math.max(0, u.spins - 1); u.balance += reward; saveDB(db); }
}

function setAwaitingUpi(userId, val) {
  const db = loadDB();
  const u = db.users[String(userId)];
  if (u) { u.awaitingUpi = val; saveDB(db); }
}

function isAwaitingUpi(userId) {
  const u = getUser(userId);
  return u ? u.awaitingUpi : false;
}

function setPendingReferrer(userId, referrerId) {
  const db = loadDB();
  const u = db.users[String(userId)];
  if (u) { u.pendingReferrer = referrerId; saveDB(db); }
}

function getPendingReferrer(userId) {
  const u = getUser(userId);
  return u ? u.pendingReferrer : null;
}

function clearPendingReferrer(userId) {
  const db = loadDB();
  const u = db.users[String(userId)];
  if (u) { u.pendingReferrer = null; saveDB(db); }
}

function createWithdrawal(userId, amount, upiId) {
  const db = loadDB();
  const reqId = db.nextReqId++;
  db.withdrawals.push({
    id: reqId,
    user_id: userId,
    username: db.users[String(userId)]?.username || "unknown",
    amount, upi_id: upiId,
    status: "pending",
    created_at: new Date().toISOString(),
  });
  saveDB(db);
  return reqId;
}

function getWithdrawal(reqId) {
  const db = loadDB();
  return db.withdrawals.find(w => w.id === reqId) || null;
}

function approveWithdrawal(reqId) {
  const db = loadDB();
  const req = db.withdrawals.find(w => w.id === reqId);
  if (!req) return;
  req.status = "approved";
  const u = db.users[String(req.user_id)];
  if (u) u.balance = Math.max(0, u.balance - req.amount);
  saveDB(db);
}

function rejectWithdrawal(reqId) {
  const db = loadDB();
  const req = db.withdrawals.find(w => w.id === reqId);
  if (req) { req.status = "rejected"; saveDB(db); }
}

module.exports = {
  registerUser, getUser, setVerified,
  addReferralSpin, useSpin,
  setAwaitingUpi, isAwaitingUpi,
  setPendingReferrer, getPendingReferrer, clearPendingReferrer,
  createWithdrawal, getWithdrawal, approveWithdrawal, rejectWithdrawal,
};
