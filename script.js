const hostBtn = document.getElementById('hostBtn');
const joinBtn = document.getElementById('joinBtn');
const resetBtn = document.getElementById('resetBtn');
const copyBtn = document.getElementById('copyBtn');
const inviteLink = document.getElementById('inviteLink');
const statusEl = document.getElementById('status');
const turnLabel = document.getElementById('turnLabel');
const boardEl = document.getElementById('board');

let peer;
let conn;
let isHost = false;
let mySymbol = null;
let gameReady = false;
let board = Array(9).fill('');
let currentTurn = 'X';
let gameOver = false;

const winLines = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function setStatus(text) {
  statusEl.textContent = text;
}

function setTurnLabel(text) {
  turnLabel.textContent = text;
}

function renderBoard() {
  boardEl.innerHTML = '';
  board.forEach((value, idx) => {
    const cell = document.createElement('button');
    cell.className = 'cell';
    if (gameOver || !gameReady || value || currentTurn !== mySymbol) {
      cell.classList.add('disabled');
    }
    cell.textContent = value;
    cell.addEventListener('click', () => onCellClick(idx));
    boardEl.appendChild(cell);
  });
}

function winnerOf(state) {
  for (const [a, b, c] of winLines) {
    if (state[a] && state[a] === state[b] && state[b] === state[c]) return state[a];
  }
  if (state.every(Boolean)) return 'draw';
  return null;
}

function updateTurnUi() {
  if (!gameReady) {
    setTurnLabel('Ожидание подключения второго игрока…');
    return;
  }
  if (gameOver) return;
  if (currentTurn === mySymbol) setTurnLabel(`Твой ход (${mySymbol})`);
  else setTurnLabel(`Ход соперника (${currentTurn})`);
}

function broadcast(payload) {
  if (conn && conn.open) conn.send(payload);
}

function startNewGame(send = true) {
  board = Array(9).fill('');
  currentTurn = 'X';
  gameOver = false;
  renderBoard();
  updateTurnUi();
  if (send) broadcast({ type: 'reset' });
}

function finishGame(result) {
  gameOver = true;
  if (result === 'draw') setTurnLabel('Ничья 🤝');
  else if (result === mySymbol) setTurnLabel(`Ты победил (${result}) 🎉`);
  else setTurnLabel(`Ты проиграл (${result})`);
  resetBtn.disabled = false;
  renderBoard();
}

function onCellClick(index) {
  if (!gameReady || gameOver) return;
  if (currentTurn !== mySymbol) return;
  if (board[index]) return;

  board[index] = mySymbol;
  currentTurn = mySymbol === 'X' ? 'O' : 'X';
  renderBoard();

  const result = winnerOf(board);
  broadcast({ type: 'move', index, symbol: mySymbol, board, currentTurn, result });

  if (result) finishGame(result);
  else updateTurnUi();
}

function onRemoteMessage(msg) {
  if (msg.type === 'start') {
    mySymbol = msg.symbol;
    gameReady = true;
    setStatus('Подключено. Игра началась!');
    resetBtn.disabled = false;
    startNewGame(false);
  }

  if (msg.type === 'move') {
    board = msg.board;
    currentTurn = msg.currentTurn;
    renderBoard();
    if (msg.result) finishGame(msg.result);
    else updateTurnUi();
  }

  if (msg.type === 'reset') {
    startNewGame(false);
    setStatus('Новая партия начата.');
  }
}

function attachConnection(c) {
  conn = c;
  conn.on('open', () => {
    setStatus('Соединение установлено.');
    gameReady = true;
    resetBtn.disabled = false;

    if (isHost) {
      mySymbol = 'X';
      conn.send({ type: 'start', symbol: 'O' });
      startNewGame(false);
    }
    updateTurnUi();
  });

  conn.on('data', onRemoteMessage);

  conn.on('close', () => {
    gameReady = false;
    setStatus('Соперник отключился. Создай новую игру.');
    setTurnLabel('Соединение закрыто.');
  });

  conn.on('error', (err) => {
    setStatus(`Ошибка соединения: ${err.message}`);
  });
}

function createHost() {
  isHost = true;
  peer = new Peer();
  setStatus('Создаю комнату...');

  peer.on('open', (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    inviteLink.value = url.toString();
    copyBtn.disabled = false;
    setStatus('Комната создана. Отправь ссылку другу.');
  });

  peer.on('connection', (c) => {
    if (conn && conn.open) {
      c.on('open', () => c.send({ type: 'busy' }));
      c.close();
      return;
    }
    attachConnection(c);
  });

  peer.on('error', (err) => {
    setStatus(`Ошибка Peer: ${err.message}`);
  });
}

function joinRoom(roomId) {
  isHost = false;
  mySymbol = 'O';
  peer = new Peer();
  setStatus('Подключаюсь к комнате...');

  peer.on('open', () => {
    const c = peer.connect(roomId, { reliable: true });
    attachConnection(c);
  });

  peer.on('error', (err) => {
    setStatus(`Ошибка подключения: ${err.message}`);
  });
}

hostBtn.addEventListener('click', () => {
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  createHost();
});

joinBtn.addEventListener('click', () => {
  const roomId = prompt('Вставь room id или ссылку приглашения');
  if (!roomId) return;
  let id = roomId.trim();
  try {
    const u = new URL(id);
    id = u.searchParams.get('room') || id;
  } catch {}
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  joinRoom(id);
});

resetBtn.addEventListener('click', () => startNewGame(true));

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteLink.value);
    setStatus('Ссылка скопирована ✅');
  } catch {
    setStatus('Не удалось скопировать. Скопируй вручную.');
  }
});

renderBoard();

const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (room) {
  hostBtn.disabled = true;
  joinBtn.disabled = true;
  joinRoom(room);
}
