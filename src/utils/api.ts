export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const session = localStorage.getItem('focodiario_session');
  let token = '';
  if (session) {
    try {
      const parsed = JSON.parse(session);
      if (parsed && parsed.token) {
        token = parsed.token;
      }
    } catch (e) {}
  }

  // Prepara os cabeçalhos de forma segura
  const modifiedInit: RequestInit = init || {};
  const headers = new Headers(modifiedInit.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  modifiedInit.headers = headers;

  // Trata globalmente erro de autenticação deslogando o usuário se o token expirar (401)
  try {
    const response = await fetch(input, modifiedInit);
    
    // Cria uma cópia da resposta para inspecionar com segurança se ela retorna HTML (bloqueio do iframe/cookies) ou JSON
    let isHtml = false;
    try {
      const responseClone = response.clone();
      const bodyText = (await responseClone.text()).trim();
      if (
        bodyText.startsWith('<') || 
        bodyText.toLowerCase().startsWith('<!doctype') ||
        bodyText.toLowerCase().includes('<html>') ||
        bodyText.toLowerCase().includes('<body>') ||
        bodyText.startsWith('A página')
      ) {
        isHtml = true;
      }
    } catch (_) {
      // Falha ao ler o clone da resposta, trata como não-HTML
    }

    const contentType = response.headers.get('content-type');
    if (isHtml || (contentType && contentType.includes('text/html') && String(input).includes('/api/'))) {
      throw new Error(
        'Bloqueio de Cookies de Segurança (AI Studio): O navegador impediu os cookies de segurança necessários dentro do painel integrado (iframe).\n\n' +
        '👉 Para RESOLVER EM 2 SEGUNDOS:\n' +
        '1. Clique no botão "Open in new tab" (Abrir em nova aba) localizado no canto superior direito do seu painel de visualização (preview).\n' +
        '2. Isso validará os cookies e permitirá o acesso imediato tanto na aba externa quanto aqui!'
      );
    }

    if (response.status === 401 && !String(input).includes('/api/user-auth/login')) {
      // Token expirado ou inválido
      localStorage.removeItem('focodiario_session');
      window.location.reload();
    }
    return response;
  } catch (error) {
    return Promise.reject(error);
  }
}
