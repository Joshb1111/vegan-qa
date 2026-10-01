/* See SDL_net.h. GPL-2.0, as OpenTyrian. */
#include "SDL_net.h"
#include <emscripten.h>
#include <stdlib.h>
struct _UDPsocket { int open; };
static struct _UDPsocket the_socket;
EM_JS(int, js_ty_send, (const Uint8 *data, int len), {
  if (!Module.tyNetSend) return 0;
  Module.tyNetSend(HEAPU8.slice(data, data + len));
  return 1;
});
EM_JS(int, js_ty_recv, (Uint8 *data, int maxlen), {
  const q = Module.tyNetQueue;
  if (!q || !q.length) return 0;
  const p = q.shift();
  const n = Math.min(p.length, maxlen);
  HEAPU8.set(p.subarray(0, n), data);
  return n;
});
int SDLNet_Init(void) { return 0; }
void SDLNet_Quit(void) {}
const char *SDLNet_GetError(void) { return "web relay"; }
int SDLNet_ResolveHost(IPaddress *address, const char *host, Uint16 port) { address->host = 0x7f000001; address->port = port; return 0; }
UDPsocket SDLNet_UDP_Open(Uint16 port) { (void)port; the_socket.open = 1; return &the_socket; }
void SDLNet_UDP_Close(UDPsocket sock) { if (sock) sock->open = 0; }
int SDLNet_UDP_Bind(UDPsocket sock, int channel, const IPaddress *address) { (void)sock; (void)address; return channel; }
int SDLNet_UDP_Send(UDPsocket sock, int channel, UDPpacket *packet) { (void)sock; (void)channel; return js_ty_send(packet->data, packet->len); }
int SDLNet_UDP_Recv(UDPsocket sock, UDPpacket *packet) {
  (void)sock;
  int n = js_ty_recv(packet->data, packet->maxlen);
  if (n <= 0) return 0;
  packet->len = n; packet->channel = 0; packet->status = n;
  return 1;
}
UDPpacket *SDLNet_AllocPacket(int size) {
  UDPpacket *p = calloc(1, sizeof(UDPpacket));
  if (!p) return NULL;
  p->data = calloc(1, size);
  p->maxlen = size;
  return p;
}
void SDLNet_FreePacket(UDPpacket *packet) { if (!packet) return; free(packet->data); free(packet); }
