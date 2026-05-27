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
    
    // Intercepta quando o proxy do AI Studio retorna HTML de verificação de cookies em vez de JSON para as rotas da API
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html') && String(input).includes('/api/')) {
      throw new Error(
        'Bloqueio de Cookies (AI Studio): O navegador impediu os cookies de segurança necessários na janela integrada (iframe). ' +
        'Para resolver isso em 2 segundos: clique no botão "Open in new tab" (Abrir em nova aba) localizado no canto superior direito do painel de visualização da plataforma. ' +
        'Isso validará as credenciais de segurança do seu navegador e permitirá o uso normal!'
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
