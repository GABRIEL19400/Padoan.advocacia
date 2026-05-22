const path     = require("path");
const express  = require("express");
const sqlite3  = require("sqlite3").verbose();
const cors     = require("cors");
const session  = require("express-session");
const axios    = require("axios");

const app = express();

const DB_FILE = process.env.SQLITE_DB_FILE
  || (process.env.VERCEL ? path.join("/tmp", "banco.db") : path.join(process.cwd(), "banco.db"));

// ─── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());
app.use(express.static("frontend"));
app.use("/admin", express.static("admin"));

app.use(session({
  secret: process.env.SESSION_SECRET || "advocacia_secret_troque_em_producao",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));

// ─── Banco de Dados ───────────────────────────────────────────────────────────
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) console.error("Erro ao conectar ao banco:", err.message);
  else     console.log("Banco de dados conectado em", DB_FILE);
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nome      TEXT    NOT NULL,
      email     TEXT,
      telefone  TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id  INTEGER NOT NULL,
      data        TEXT    NOT NULL,
      hora        TEXT    NOT NULL,
      tipo        TEXT    NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
    )
  `);
});

// ─── Helpers / Validação ──────────────────────────────────────────────────────
const HORAS_VALIDAS = ["09:00","10:00","11:00","14:00","15:00","16:00"];
const TIPOS_VALIDOS = ["Online","Presencial"];
const REGEX_DATA    = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HORA    = /^\d{2}:\d{2}$/;
const REGEX_EMAIL   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarAgendamento({ nome, email, data, hora, tipo }) {
  if (!nome || nome.trim().length < 2)
    return "Nome inválido (mínimo 2 caracteres).";
  if (email && !REGEX_EMAIL.test(email))
    return "E-mail inválido.";
  if (!data || !REGEX_DATA.test(data))
    return "Data inválida. Formato esperado: YYYY-MM-DD.";
  if (!hora || !REGEX_HORA.test(hora))
    return "Hora inválida. Formato esperado: HH:MM.";
  if (!HORAS_VALIDAS.includes(hora))
    return `Hora fora das opções disponíveis: ${HORAS_VALIDAS.join(", ")}.`;
  if (!TIPOS_VALIDOS.includes(tipo))
    return "Tipo inválido. Escolha: Online ou Presencial.";

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  if (new Date(data + "T00:00:00") < hoje)
    return "Não é possível agendar em datas passadas.";

  return null;
}

// ─── Middleware de autenticação ───────────────────────────────────────────────
function requerLogin(req, res, next) {
  if (req.session?.logado) return next();
  res.status(401).json({ erro: "Não autorizado. Faça login." });
}

// ─── ROTA: Login ──────────────────────────────────────────────────────────────
const ADMIN_USUARIO = process.env.ADMIN_USUARIO || "admin";
const ADMIN_SENHA   = process.env.ADMIN_SENHA   || "1234";

app.post("/login", (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha)
    return res.status(400).json({ erro: "Usuário e senha são obrigatórios." });

  if (usuario === ADMIN_USUARIO && senha === ADMIN_SENHA) {
    req.session.logado = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ erro: "Usuário ou senha incorretos." });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/session", (req, res) => {
  res.json({ logado: !!req.session?.logado });
});

// ─── ROTA: Agendar consulta ───────────────────────────────────────────────────
app.post("/agendar", (req, res) => {
  const { nome, email, telefone, data, hora, tipo } = req.body;

  const erroValidacao = validarAgendamento({ nome, email, data, hora, tipo });
  if (erroValidacao) return res.status(400).json({ erro: erroValidacao });

  db.get(
    "SELECT id FROM agendamentos WHERE data = ? AND hora = ?",
    [data, hora],
    (err, row) => {
      if (err)  return res.status(500).json({ erro: "Erro interno no servidor." });
      if (row)  return res.status(409).json({ erro: "Horário já ocupado. Escolha outro." });

      db.run(
        "INSERT INTO clientes (nome, email, telefone) VALUES (?, ?, ?)",
        [nome.trim(), email?.trim() || "", telefone?.trim() || ""],
        function (err) {
          if (err) return res.status(500).json({ erro: "Erro ao salvar cliente." });

          const cliente_id = this.lastID;

          db.run(
            "INSERT INTO agendamentos (cliente_id, data, hora, tipo) VALUES (?, ?, ?, ?)",
            [cliente_id, data, hora, tipo],
            function (err) {
              if (err) return res.status(500).json({ erro: "Erro ao salvar agendamento." });

              res.status(201).json({ ok: true, id: this.lastID });

              // Enviar WhatsApp em background (sem bloquear a resposta)
              if (telefone) {
                const WHATSAPP_APIKEY = process.env.WHATSAPP_APIKEY || "9404693";
                const mensagem =
                  `Olá ${nome.trim()}!\n\n` +
                  `Sua consulta foi agendada com sucesso.\n\n` +
                  `📅 Data: ${data}\n⏰ Hora: ${hora}\n📍 Tipo: ${tipo}\n\nPadoan Advocacia`;

                axios.get(
                  `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(telefone)}&text=${encodeURIComponent(mensagem)}&apikey=${WHATSAPP_APIKEY}`
                )
                .then(() => console.log(`WhatsApp enviado para ${telefone}`))
                .catch((e)  => console.error("Erro ao enviar WhatsApp:", e.message));
              }
            }
          );
        }
      );
    }
  );
});

// ─── ROTA: Listar agendamentos (protegida) ────────────────────────────────────
app.get("/agendamentos", requerLogin, (req, res) => {
  db.all(`
    SELECT
      agendamentos.id,
      clientes.nome,
      clientes.email,
      clientes.telefone,
      agendamentos.data,
      agendamentos.hora,
      agendamentos.tipo
    FROM agendamentos
    JOIN clientes ON clientes.id = agendamentos.cliente_id
    ORDER BY agendamentos.data ASC, agendamentos.hora ASC
  `, (err, rows) => {
    if (err) return res.status(500).json({ erro: "Erro ao buscar agendamentos." });
    res.json(rows);
  });
});

// ─── ROTA: Editar agendamento (protegida) ─────────────────────────────────────
app.put("/agendamentos/:id", requerLogin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  const { data, hora } = req.body;

  if (!data || !REGEX_DATA.test(data))
    return res.status(400).json({ erro: "Data inválida." });
  if (!hora || !REGEX_HORA.test(hora) || !HORAS_VALIDAS.includes(hora))
    return res.status(400).json({ erro: "Hora inválida ou fora das opções." });

  db.get(
    "SELECT id FROM agendamentos WHERE data = ? AND hora = ? AND id != ?",
    [data, hora, id],
    (err, row) => {
      if (err)  return res.status(500).json({ erro: "Erro interno." });
      if (row)  return res.status(409).json({ erro: "Horário já ocupado." });

      db.run(
        "UPDATE agendamentos SET data = ?, hora = ? WHERE id = ?",
        [data, hora, id],
        function (err) {
          if (err)           return res.status(500).json({ erro: "Erro ao atualizar." });
          if (!this.changes) return res.status(404).json({ erro: "Agendamento não encontrado." });
          res.json({ ok: true });
        }
      );
    }
  );
});

// ─── ROTA: Deletar agendamento (protegida) ────────────────────────────────────
app.delete("/agendamentos/:id", requerLogin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ erro: "ID inválido." });

  db.run("DELETE FROM agendamentos WHERE id = ?", [id], function (err) {
    if (err)           return res.status(500).json({ erro: "Erro ao excluir." });
    if (!this.changes) return res.status(404).json({ erro: "Agendamento não encontrado." });
    res.json({ ok: true });
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
}

module.exports = app;
