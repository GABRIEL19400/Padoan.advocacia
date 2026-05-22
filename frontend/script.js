// ─── Tema ─────────────────────────────────────────────────────────────────────
(function aplicarTema() {
  const tema = localStorage.getItem("tema");
  if (tema === "claro") document.body.classList.add("claro");
})();

document.getElementById("btn-tema")?.addEventListener("click", () => {
  document.body.classList.toggle("claro");
  localStorage.setItem("tema", document.body.classList.contains("claro") ? "claro" : "escuro");
  document.getElementById("btn-tema").textContent =
    document.body.classList.contains("claro") ? "🌙" : "☀️";
});

// ─── Nav: scroll + mobile ─────────────────────────────────────────────────────
window.addEventListener("scroll", () => {
  document.getElementById("nav")?.classList.toggle("scrolled", window.scrollY > 40);
});

document.getElementById("nav-toggle")?.addEventListener("click", function () {
  const links = document.querySelector(".nav-links");
  const aberto = links.classList.toggle("aberto");
  this.setAttribute("aria-expanded", aberto);
});

document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelector(".nav-links")?.classList.remove("aberto");
  });
});

// ─── Data mínima = hoje ───────────────────────────────────────────────────────
(function definirDataMinima() {
  const inputData = document.getElementById("data");
  if (inputData) inputData.min = new Date().toISOString().split("T")[0];
})();

// ─── Utilitários UI ───────────────────────────────────────────────────────────
function mostrarAlerta(mensagem, tipo = "erro") {
  const alerta = document.getElementById("alerta");
  if (!alerta) return;
  alerta.textContent = mensagem;
  alerta.className = `alerta alerta-${tipo}`;
  alerta.hidden = false;
  alerta.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => { alerta.hidden = true; }, 7000);
}

function setLoading(ativo) {
  const btn     = document.getElementById("btn-agendar");
  const texto   = document.getElementById("btn-texto");
  const loading = document.getElementById("btn-loading");
  if (!btn) return;
  btn.disabled  = ativo;
  texto.hidden  = ativo;
  loading.hidden = !ativo;
}

function limparErros() {
  document.querySelectorAll(".campo-erro").forEach(el => el.textContent = "");
  document.querySelectorAll("input.invalido, select.invalido").forEach(el => el.classList.remove("invalido"));
}

function marcarErro(id, msg) {
  const campo = document.getElementById(id);
  const erro  = document.getElementById("erro-" + id);
  campo?.classList.add("invalido");
  if (erro) erro.textContent = msg;
}

// ─── Validação client-side ────────────────────────────────────────────────────
function validar(nome, email, data, hora, tipo) {
  let ok = true;

  if (!nome || nome.trim().length < 2) {
    marcarErro("nome", "Nome inválido (mínimo 2 caracteres).");
    ok = false;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    marcarErro("email", "E-mail inválido.");
    ok = false;
  }
  if (!data) {
    marcarErro("data", "Selecione uma data.");
    ok = false;
  } else {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    if (new Date(data + "T00:00:00") < hoje) {
      marcarErro("data", "Não é possível agendar em datas passadas.");
      ok = false;
    }
  }
  if (!hora) { marcarErro("hora", "Selecione um horário."); ok = false; }
  if (!tipo) { marcarErro("tipo", "Selecione a modalidade."); ok = false; }

  return ok;
}

// ─── Formulário de agendamento ────────────────────────────────────────────────
document.getElementById("form-agenda")?.addEventListener("submit", async function (e) {
  e.preventDefault();
  limparErros();

  const nome     = document.getElementById("nome").value.trim();
  const email    = document.getElementById("email").value.trim();
  const telefone = document.getElementById("telefone").value.trim();
  const data     = document.getElementById("data").value;
  const hora     = document.getElementById("hora").value;
  const tipo     = document.getElementById("tipo").value;

  if (!validar(nome, email, data, hora, tipo)) return;

  setLoading(true);

  try {
    const res = await fetch("/agendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, telefone, data, hora, tipo }),
    });

    const resposta = await res.json();

    if (!res.ok || resposta.erro) {
      mostrarAlerta(resposta.erro || "Erro ao realizar agendamento.");
      return;
    }

    mostrarAlerta("Consulta agendada com sucesso! Em breve entraremos em contato.", "sucesso");
    this.reset();

  } catch {
    mostrarAlerta("Não foi possível conectar ao servidor. Tente novamente.");
  } finally {
    setLoading(false);
  }
});

// ─── Formulário de contato (abre WhatsApp) ────────────────────────────────────
function enviarContato() {
  const nome     = document.getElementById("c-nome")?.value.trim();
  const email    = document.getElementById("c-email")?.value.trim();
  const mensagem = document.getElementById("c-mensagem")?.value.trim();

  if (!mensagem) { alert("Escreva uma mensagem."); return; }

  const texto = `Olá, sou ${nome || "cliente"} (${email || "sem e-mail"}).\n\n${mensagem}`;
  window.open(`https://wa.me/5517991502882?text=${encodeURIComponent(texto)}`, "_blank");
}
