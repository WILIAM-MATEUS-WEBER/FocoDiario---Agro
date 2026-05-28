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
