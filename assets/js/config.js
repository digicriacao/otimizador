/* =========================================================================
   Configuração da integração com o SharePoint / OneDrive
   Estes IDs são identificadores públicos do app no Microsoft Entra,
   não são senhas: podem ficar no GitHub sem problema.
   ========================================================================= */
window.OTIMIZADOR_CONFIG = {
  microsoft: {
    clientId: 'd7ece8ff-91c1-4808-b7cd-eda1dbd1a368', // ID do aplicativo (cliente)
    tenantId: '16d33860-3ad3-492d-a8cb-1ef530cbaab8', // ID do diretório (locatário) da Digi
  },
  // Processamento online (GitHub Actions). Repositório PRIVADO que recebe os lotes.
  // O token do GitHub NÃO fica aqui: ele é um segredo do intermediário (Cloudflare Worker).
  github: {
    repo: 'digicriacao/otimizador-processamento',
    proxy: 'https://otimizador-digi.criacao01.workers.dev', // intermediário (Cloudflare Worker)
  },
};
