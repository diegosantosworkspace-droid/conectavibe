# ConectaVibe • Mural Corporativo & Hub de Fornecedores

App web estático (HTML + JS ES modules) com Firebase (Auth anônimo + Firestore) e deploy na Vercel.

## Estrutura

```
conectavibe/
├── index.html
├── vercel.json
├── firestore.rules
├── README.md
└── js/
    ├── firebase-config.js   # preencher as 3 chaves do projeto conectavibe-9acb1
    └── app.js
```

## Configuração do Firebase

1. Abra `js/firebase-config.js`.
2. Substitua os três placeholders:
   - `COLE_AQUI_SUA_API_KEY`
   - `COLE_AQUI_SEU_SENDER_ID`
   - `COLE_AQUI_SEU_APP_ID`
   pelas credenciais do projeto `conectavibe-9acb1` (Console Firebase → Configurações do projeto → Seus apps → Web).
3. Publique as regras do Firestore copiando o conteúdo de `firestore.rules` em Console Firebase → Firestore → Regras.

## Primeiro acesso (bootstrap do Admin)

1. Abra o `index.html` no navegador (ou o link da Vercel).
2. A Portaria estará vazia → o primeiro celular informado vira **Administrador Principal**.
3. Depois, use o Painel Admin para convidar equipe/fornecedores via WhatsApp.

## Deploy na Vercel

1. Envie esta pasta para um repositório no GitHub.
2. Importe o repositório na Vercel (framework: "Other" / estático).
3. O `vercel.json` já aplica `cleanUrls`, `trailingSlash: false` e headers de segurança.
4. Use o URL HTTPS gerado para disparar convites no WhatsApp (aba Painel Admin).

## Observações de revisão (aplicadas)

- **Regras do Firestore endurecidas**: escrita na `whitelist` agora exige usuário autenticado (`isSignedIn()`). O bootstrap do primeiro Admin faz `signInAnonymously` antes de gravar, mantendo o Primeiro Acesso funcionando. Leitura pública mantida (necessária para validar o celular na Portaria antes do login).
- **XSS mitigado**: adicionado `escapeHtml` e aplicado em títulos, nomes, bases, categorias, selos de destaque, músicas e confirmações de leitura renderizados via `innerHTML`.
- **Vídeos** limitados a ~750 KB / 20 s e imagens comprimidas no cliente para manter o Firestore gratuito rápido. UI em 1080p preservada.
