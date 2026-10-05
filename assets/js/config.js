/* =========================================================================
   Configuração das integrações com nuvem
   Preencha os IDs abaixo para que funcionem para TODA a equipe.
   Eles são identificadores públicos de aplicativo, não são senhas:
   podem ficar no GitHub sem problema.
   (Também dá para preencher só no seu navegador, pelo ícone de engrenagem.)
   ========================================================================= */
window.OTIMIZADOR_CONFIG = {
  microsoft: {
    clientId: '',              // Microsoft Entra ID > Registros de aplicativo > ID do aplicativo (cliente)
    tenantId: 'organizations', // ID do diretório da Digi, ou 'organizations' para qualquer conta corporativa
  },
  google: {
    clientId: '',              // Google Cloud > APIs e serviços > Credenciais > ID do cliente OAuth (termina em .apps.googleusercontent.com)
  },
  dropbox: {
    appKey: '',                // Dropbox App Console > seu app > App key
  },
};
