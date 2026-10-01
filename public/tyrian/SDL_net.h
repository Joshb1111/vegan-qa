/* A browser stand-in for SDL_net, just enough for OpenTyrian's network play.
   Packets are not sent over UDP: they are handed to JavaScript (Module.tyNetSend), which carries them to the other
   player (a WebRTC data channel, or the Ably room as a fallback); incoming packets are queued by JavaScript and read
   back with Module.tyNetRecv. Written for the understand-veganism.com planet game, 2026. GPL-2.0, as OpenTyrian. */
#ifndef SDL_NET_WEB_H
#define SDL_NET_WEB_H
#include "SDL.h"
typedef struct { Uint32 host; Uint16 port; } IPaddress;
typedef struct { int channel; Uint8 *data; int len; int maxlen; int status; IPaddress address; } UDPpacket;
typedef struct _UDPsocket *UDPsocket;
int SDLNet_Init(void);
void SDLNet_Quit(void);
const char *SDLNet_GetError(void);
int SDLNet_ResolveHost(IPaddress *address, const char *host, Uint16 port);
UDPsocket SDLNet_UDP_Open(Uint16 port);
void SDLNet_UDP_Close(UDPsocket sock);
int SDLNet_UDP_Bind(UDPsocket sock, int channel, const IPaddress *address);
int SDLNet_UDP_Send(UDPsocket sock, int channel, UDPpacket *packet);
int SDLNet_UDP_Recv(UDPsocket sock, UDPpacket *packet);
UDPpacket *SDLNet_AllocPacket(int size);
void SDLNet_FreePacket(UDPpacket *packet);
static inline void SDLNet_Write16(Uint16 value, void *area) { Uint8 *a = (Uint8 *)area; a[0] = (Uint8)(value >> 8); a[1] = (Uint8)value; }
static inline Uint16 SDLNet_Read16(const void *area) { const Uint8 *a = (const Uint8 *)area; return (Uint16)((a[0] << 8) | a[1]); }
static inline void SDLNet_Write32(Uint32 value, void *area) { Uint8 *a = (Uint8 *)area; a[0] = value >> 24; a[1] = value >> 16; a[2] = value >> 8; a[3] = value; }
static inline Uint32 SDLNet_Read32(const void *area) { const Uint8 *a = (const Uint8 *)area; return ((Uint32)a[0] << 24) | ((Uint32)a[1] << 16) | ((Uint32)a[2] << 8) | a[3]; }
#endif
