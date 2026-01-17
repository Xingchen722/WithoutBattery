// main.js

const messagesContainer = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

let inactivityTime = 0;
const INACTIVITY_LIMIT = 60; // seconds

// --- Inactivity Detection ---
function resetTimer() {
  inactivityTime = 0;
}
document.onmousemove = resetTimer;
document.onkeydown = resetTimer;

setInterval(() => {
  inactivityTime++;
  if (inactivityTime > INACTIVITY_LIMIT) {
    triggerPunishment();
  }
}, 1000);

function triggerPunishment() {
  alert("Hey! Stop procrastinating!"); // placeholder
  // TODO: add sound, screen shake, or cursor effects
}

// --- Chat Functions ---
sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const msg = userInput.value.trim();
  if (!msg) return;

  addMessage(msg, "user-msg");
  userInput.value = "";

  // Mock API call for now
  setTimeout(() => {
    const aiResponse = getAIResponse(msg);
    addMessage(aiResponse, "ai-msg");
  }, 500);
}

function addMessage(text, className) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${className}`;
  msgDiv.innerText = text;
  messagesContainer.appendChild(msgDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Mock AI Response ---
function getAIResponse(question) {
  // Simple good/bad question filter
  if (question.split(" ").length < 3) {
    return "I refuse to answer 😏"; // bad question
  }
  return "This is a proper AI response 👍"; // good question
}
