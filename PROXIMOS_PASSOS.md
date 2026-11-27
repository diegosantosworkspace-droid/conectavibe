# ConectaVibe — Status & Próximos Passos (salvo para amanhã)

## ✅ O que já está pronto
- Projeto criado em `conectavibe/` (index.html, js/app.js, js/firebase-config.js, vercel.json, firestore.rules, README.md).
- Chaves do Firebase preenchidas em `js/firebase-config.js` (apiKey, messagingSenderId, appId do projeto conectavibe-9acb1).
- Regras do Firestore publicadas (Firestore → Rules → Publicar).
- Login anônimo ATIVADO no Firebase (Authentication → Sign-in method → Anônimo).
- Domínio `localhost` autorizado.
- Código revisado: regras endurecidas + escape de HTML (XSS).
- Repositório Git local inicializado e commitado (branch `main`).
- Servidor local testado em http://localhost:8080 (funcionou: Primeiro Acesso → Admin).

## 🔜 O que falta para ficar online
1. Criar repositório no GitHub (https://github.com/new) — nome `conectavibe`.
2. Push do código local:
   ```bash
   cd conectavibe
   git remote add origin https://github.com/SEU_USUARIO/conectavibe.git
   git push -u origin main
   ```
3. Deploy no Vercel: Add New → Project → conectar repo → Framework "Other" → Deploy.
4. No Firebase → Authentication → Settings → Authorized domains → adicionar domínio do Vercel (ex.: xxx.vercel.app).
5. Testar no celular: abrir a URL do Vercel → Primeiro Acesso → Admin.

## 📌 Notas
- Painel Admin "vazio" é normal: ainda não há convidados nem posts pendentes. Use o formulário "Autorizar & Gerar WhatsApp" para convidar.
- Para reiniciar o servidor local amanhã:
  ```bash
  cd conectavibe
  python -m http.server 8080
  ```
  Depois abra http://localhost:8080.
- Arquivo de regras: `firestore.rules` (copiar/colar no Firebase se precisar republicar).

Bom descanso! Amanhã retomamos do Passo 1. 🤝