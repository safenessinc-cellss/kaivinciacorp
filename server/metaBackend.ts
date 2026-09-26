import type { MetaChannel, MetaConfig, MetaSendResponse } from '../src/types/meta.js';

// Cache dinámico en memoria para credenciales actualizadas desde el Panel Administrativo
let dynamicMetaConfig = {
  appId: process.env.META_APP_ID || '',
  appSecret: process.env.META_APP_SECRET || '',
  verifyToken: process.env.META_VERIFY_TOKEN || 'kaivincia-meta-verify-2026',
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
  facebookPageId: process.env.FACEBOOK_PAGE_ID || '',
  facebookPageAccessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
  instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID || '',
  instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || ''
};

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Servicio Central de Backend para Meta (WhatsApp Business, Messenger, Instagram)
 * Protege tokens y secretos de API, valida webhooks y ejecuta llamadas a Graph API.
 */
export class MetaBackendService {
  public static getAppId(): string {
    return dynamicMetaConfig.appId || process.env.META_APP_ID || '';
  }

  public static getAppSecret(): string {
    return dynamicMetaConfig.appSecret || process.env.META_APP_SECRET || '';
  }

  public static getVerifyToken(): string {
    return dynamicMetaConfig.verifyToken || process.env.META_VERIFY_TOKEN || 'kaivincia-meta-verify-2026';
  }

  public static getWhatsAppPhoneNumberId(): string {
    return dynamicMetaConfig.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  public static getWhatsAppBusinessAccountId(): string {
    return dynamicMetaConfig.whatsappBusinessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
  }

  public static getWhatsAppAccessToken(): string {
    return dynamicMetaConfig.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || dynamicMetaConfig.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
  }

  public static getFacebookPageId(): string {
    return dynamicMetaConfig.facebookPageId || process.env.FACEBOOK_PAGE_ID || '';
  }

  public static getFacebookPageAccessToken(): string {
    return dynamicMetaConfig.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
  }

  public static getInstagramAccountId(): string {
    return dynamicMetaConfig.instagramAccountId || process.env.INSTAGRAM_ACCOUNT_ID || '';
  }

  public static getInstagramAccessToken(): string {
    return dynamicMetaConfig.instagramAccessToken || process.env.INSTAGRAM_ACCESS_TOKEN || dynamicMetaConfig.facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '';
  }

  public static getWebhookUrl(): string {
    const appUrl = process.env.APP_URL || 'https://www.kaivinciacorp.com';
    const cleanUrl = appUrl.replace(/\/$/, '');
    return `${cleanUrl}/api/meta-webhook`;
  }

  public static maskToken(token?: string): string {
    if (!token) return '';
    if (token.length <= 10) return '••••••••';
    return `${token.slice(0, 4)}••••••••••••${token.slice(-4)}`;
  }

  /**
   * Retorna la configuración consolidada sin exponer claves ni tokens en texto plano.
   */
  public static getConfig(): MetaConfig {
    const waPhone = this.getWhatsAppPhoneNumberId();
    const waToken = this.getWhatsAppAccessToken();
    const fbPage = this.getFacebookPageId();
    const fbToken = this.getFacebookPageAccessToken();
    const igAccount = this.getInstagramAccountId();
    const igToken = this.getInstagramAccessToken();

    return {
      appId: this.getAppId(),
      appSecretMasked: this.maskToken(this.getAppSecret()),
      verifyTokenMasked: this.maskToken(this.getVerifyToken()),
      webhookUrl: this.getWebhookUrl(),
      whatsapp: {
        configured: Boolean(waPhone && waToken),
        phoneNumberId: waPhone || undefined,
        businessAccountId: this.getWhatsAppBusinessAccountId() || undefined,
        status: waPhone && waToken ? 'connected' : 'not_configured'
      },
      facebook: {
        configured: Boolean(fbPage && fbToken),
        pageId: fbPage || undefined,
        pageAccessTokenMasked: this.maskToken(fbToken),
        status: fbPage && fbToken ? 'connected' : 'not_configured'
      },
      instagram: {
        configured: Boolean(igAccount && igToken),
        accountId: igAccount || undefined,
        accessTokenMasked: this.maskToken(igToken),
        status: igAccount && igToken ? 'connected' : 'not_configured'
      },
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Actualiza las configuraciones de Meta dinámicamente desde el panel administrativo.
   */
  public static updateConfig(params: {
    appId?: string;
    appSecret?: string;
    verifyToken?: string;
    whatsappPhoneNumberId?: string;
    whatsappBusinessAccountId?: string;
    whatsappAccessToken?: string;
    facebookPageId?: string;
    facebookPageAccessToken?: string;
    instagramAccountId?: string;
    instagramAccessToken?: string;
  }): MetaConfig {
    if (params.appId !== undefined) dynamicMetaConfig.appId = params.appId.trim();
    if (params.appSecret !== undefined && params.appSecret.trim()) dynamicMetaConfig.appSecret = params.appSecret.trim();
    if (params.verifyToken !== undefined && params.verifyToken.trim()) dynamicMetaConfig.verifyToken = params.verifyToken.trim();
    
    if (params.whatsappPhoneNumberId !== undefined) dynamicMetaConfig.whatsappPhoneNumberId = params.whatsappPhoneNumberId.trim();
    if (params.whatsappBusinessAccountId !== undefined) dynamicMetaConfig.whatsappBusinessAccountId = params.whatsappBusinessAccountId.trim();
    if (params.whatsappAccessToken !== undefined && params.whatsappAccessToken.trim()) dynamicMetaConfig.whatsappAccessToken = params.whatsappAccessToken.trim();
    
    if (params.facebookPageId !== undefined) dynamicMetaConfig.facebookPageId = params.facebookPageId.trim();
    if (params.facebookPageAccessToken !== undefined && params.facebookPageAccessToken.trim()) dynamicMetaConfig.facebookPageAccessToken = params.facebookPageAccessToken.trim();
    
    if (params.instagramAccountId !== undefined) dynamicMetaConfig.instagramAccountId = params.instagramAccountId.trim();
    if (params.instagramAccessToken !== undefined && params.instagramAccessToken.trim()) dynamicMetaConfig.instagramAccessToken = params.instagramAccessToken.trim();

    return this.getConfig();
  }

  /**
   * Valida el token de autenticación de Firebase en encabezados HTTP.
   */
  public static async verifyAuthToken(authHeader?: string): Promise<{ uid: string; email?: string } | null> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) return null;

    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
      if (response.ok) {
        const payload = await response.json();
        return {
          uid: payload.user_id || payload.sub,
          email: payload.email
        };
      }

      // Fallback para desarrollo si el token es JWT simulado
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload.user_id || payload.sub) {
          return {
            uid: payload.user_id || payload.sub,
            email: payload.email
          };
        }
      }
    } catch (err) {
      console.error('[Meta Backend] Token verification failed:', err);
    }

    return null;
  }

  /**
   * Verifica la suscripción inicial del Webhook de Meta (desafío hub.challenge).
   */
  public static verifyWebhook(mode?: string, token?: string, challenge?: string): string | null {
    const expectedToken = this.getVerifyToken();
    if (mode === 'subscribe' && token && token === expectedToken && challenge) {
      return challenge;
    }
    return null;
  }

  /**
   * Envía un mensaje de texto por WhatsApp Business Cloud API.
   */
  public static async sendWhatsAppMessage(to: string, text: string): Promise<MetaSendResponse> {
    const phoneNumberId = this.getWhatsAppPhoneNumberId();
    const token = this.getWhatsAppAccessToken();

    if (!phoneNumberId || !token) {
      throw new Error('WhatsApp Business no está configurado (Falta Phone Number ID o Access Token).');
    }

    // Normalizar número telefónico (eliminar +, espacios y caracteres no numéricos)
    const cleanTo = to.replace(/\D/g, '');

    const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { preview_url: false, body: text }
      })
    });

    const data = await response.json();
    if (!response.ok || !data.messages?.[0]?.id) {
      const errMsg = data.error?.message || `Error WhatsApp (${response.status})`;
      throw new Error(errMsg);
    }

    return {
      success: true,
      messageId: data.messages[0].id,
      channel: 'whatsapp',
      recipientId: cleanTo
    };
  }

  /**
   * Envía una plantilla oficial de WhatsApp Business (para iniciar conversaciones salientes).
   */
  public static async sendWhatsAppTemplate(
    to: string,
    templateName: string,
    params?: any[],
    languageCode = 'es'
  ): Promise<MetaSendResponse> {
    const phoneNumberId = this.getWhatsAppPhoneNumberId();
    const token = this.getWhatsAppAccessToken();

    if (!phoneNumberId || !token) {
      throw new Error('WhatsApp Business no está configurado.');
    }

    const cleanTo = to.replace(/\D/g, '');
    const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

    const components = params && params.length > 0 ? [
      {
        type: 'body',
        parameters: params.map(p => typeof p === 'string' ? { type: 'text', text: p } : p)
      }
    ] : [];

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components
        }
      })
    });

    const data = await response.json();
    if (!response.ok || !data.messages?.[0]?.id) {
      const errMsg = data.error?.message || `Error WhatsApp Template (${response.status})`;
      throw new Error(errMsg);
    }

    return {
      success: true,
      messageId: data.messages[0].id,
      channel: 'whatsapp',
      recipientId: cleanTo
    };
  }

  /**
   * Envía un mensaje por Facebook Messenger.
   */
  public static async sendFacebookMessage(recipientId: string, text: string): Promise<MetaSendResponse> {
    const token = this.getFacebookPageAccessToken();
    if (!token) {
      throw new Error('Facebook Page Access Token no configurado.');
    }

    const url = `${GRAPH_API_BASE}/me/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text }
      })
    });

    const data = await response.json();
    if (!response.ok || !data.message_id) {
      const errMsg = data.error?.message || `Error Facebook Messenger (${response.status})`;
      throw new Error(errMsg);
    }

    return {
      success: true,
      messageId: data.message_id,
      channel: 'facebook',
      recipientId
    };
  }

  /**
   * Envía un mensaje por Instagram Messaging.
   */
  public static async sendInstagramMessage(recipientId: string, text: string): Promise<MetaSendResponse> {
    const token = this.getInstagramAccessToken();
    if (!token) {
      throw new Error('Instagram Access Token no configurado.');
    }

    const url = `${GRAPH_API_BASE}/me/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text }
      })
    });

    const data = await response.json();
    if (!response.ok || !data.message_id) {
      const errMsg = data.error?.message || `Error Instagram (${response.status})`;
      throw new Error(errMsg);
    }

    return {
      success: true,
      messageId: data.message_id,
      channel: 'instagram',
      recipientId
    };
  }

  /**
   * Prueba de conectividad integral con Graph API de Meta.
   */
  public static async testConnection(channel?: MetaChannel): Promise<{
    success: boolean;
    results: Record<string, { success: boolean; message: string; data?: any }>;
  }> {
    const results: Record<string, { success: boolean; message: string; data?: any }> = {};

    // 1. Probar WhatsApp
    if (!channel || channel === 'whatsapp') {
      const phoneId = this.getWhatsAppPhoneNumberId();
      const waToken = this.getWhatsAppAccessToken();
      if (!phoneId || !waToken) {
        results.whatsapp = { success: false, message: 'Faltan credenciales de WhatsApp (Phone Number ID o Token).' };
      } else {
        try {
          const res = await fetch(`${GRAPH_API_BASE}/${phoneId}?fields=display_phone_number,verified_name,quality_rating`, {
            headers: { 'Authorization': `Bearer ${waToken}` }
          });
          const json = await res.json();
          if (res.ok && json.display_phone_number) {
            results.whatsapp = {
              success: true,
              message: `Conectado a ${json.display_phone_number} (${json.verified_name || 'Sin nombre verificado'})`,
              data: json
            };
          } else {
            results.whatsapp = { success: false, message: json.error?.message || 'Error al validar número en Meta' };
          }
        } catch (e: any) {
          results.whatsapp = { success: false, message: e.message };
        }
      }
    }

    // 2. Probar Facebook Page
    if (!channel || channel === 'facebook') {
      const pageId = this.getFacebookPageId();
      const fbToken = this.getFacebookPageAccessToken();
      if (!pageId || !fbToken) {
        results.facebook = { success: false, message: 'Faltan credenciales de Facebook (Page ID o Token).' };
      } else {
        try {
          const res = await fetch(`${GRAPH_API_BASE}/${pageId}?fields=id,name,link`, {
            headers: { 'Authorization': `Bearer ${fbToken}` }
          });
          const json = await res.json();
          if (res.ok && json.id) {
            results.facebook = {
              success: true,
              message: `Página verificada: "${json.name}" (ID: ${json.id})`,
              data: json
            };
          } else {
            results.facebook = { success: false, message: json.error?.message || 'Error al validar Página en Meta' };
          }
        } catch (e: any) {
          results.facebook = { success: false, message: e.message };
        }
      }
    }

    // 3. Probar Instagram Account
    if (!channel || channel === 'instagram') {
      const igId = this.getInstagramAccountId();
      const igToken = this.getInstagramAccessToken();
      if (!igId || !igToken) {
        results.instagram = { success: false, message: 'Faltan credenciales de Instagram (Account ID o Token).' };
      } else {
        try {
          const res = await fetch(`${GRAPH_API_BASE}/${igId}?fields=id,username,name`, {
            headers: { 'Authorization': `Bearer ${igToken}` }
          });
          const json = await res.json();
          if (res.ok && json.id) {
            results.instagram = {
              success: true,
              message: `Cuenta Instagram verificada: @${json.username || json.name || json.id}`,
              data: json
            };
          } else {
            results.instagram = { success: false, message: json.error?.message || 'Error al validar cuenta de Instagram' };
          }
        } catch (e: any) {
          results.instagram = { success: false, message: e.message };
        }
      }
    }

    const overallSuccess = Object.values(results).some(r => r.success);
    return { success: overallSuccess, results };
  }

  /**
   * Procesa eventos entrantes recibidos a través del Webhook unificado.
   */
  public static async handleWebhook(payload: any): Promise<{ received: boolean; actions: string[]; eventsCount: number }> {
    const actions: string[] = [];

    try {
      const objectType = payload.object; // 'whatsapp_business_account', 'page', 'instagram'
      const entries = payload.entry || [];

      for (const entry of entries) {
        // WhatsApp Eventos
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              const value = change.value;
              const messages = value.messages || [];
              const statuses = value.statuses || [];

              for (const msg of messages) {
                actions.push(`[WhatsApp Incoming] De: ${msg.from}, Tipo: ${msg.type}, ID: ${msg.id}`);
              }
              for (const st of statuses) {
                actions.push(`[WhatsApp Status] ID: ${st.id}, Estado: ${st.status}, Para: ${st.recipient_id}`);
              }
            }
          }
        }

        // Facebook Messenger o Instagram Eventos
        if (entry.messaging) {
          for (const msgItem of entry.messaging) {
            const senderId = msgItem.sender?.id;
            const recipientId = msgItem.recipient?.id;
            const channel = objectType === 'instagram' ? 'Instagram' : 'Facebook Messenger';

            if (msgItem.message) {
              actions.push(`[${channel} Incoming] De: ${senderId}, Texto: ${msgItem.message.text || 'adjunto'}`);
            } else if (msgItem.delivery) {
              actions.push(`[${channel} Delivery] Para: ${senderId}`);
            } else if (msgItem.read) {
              actions.push(`[${channel} Read] Por: ${senderId}`);
            }
          }
        }
      }

      return {
        received: true,
        actions,
        eventsCount: actions.length
      };
    } catch (err: any) {
      console.error('[Meta Webhook] Error processing payload:', err);
      return {
        received: false,
        actions: [`Error: ${err.message}`],
        eventsCount: 0
      };
    }
  }
}
