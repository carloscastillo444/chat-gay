# Chat Gay 🌈 – V1.2

## Ajustes de esta versión
- Interfaz responsive refinada, especialmente el chat privado en móviles.
- Selector de emojis con separación visual y panel compacto.
- Chat general y chat privado comparten identidad de formato: negrita, cursiva, subrayado y color.
- El formato seleccionado se conserva al cambiar entre chat general y conversaciones privadas.
- El Super Host dispone de un botón 🌈 adicional para un estilo especial de gradiente en la composición.
- Las ventanas privadas se convierten en un panel flotante cómodo en pantallas pequeñas.

## Super Host
El nickname y contraseña se cambian en `config.js`.

## Ejecutar
```bash
npm install
npm start
```
Luego abre `http://localhost:3000`.

## Moderación actualizada
- `/muteall` pausa el chat general de la sala durante 60 segundos. El Super Host puede seguir escribiendo.
- `/ban nickname` bloquea la IP de la conexión identificada para impedir que vuelva a entrar a cualquiera de las 20 salas aunque cambie de nickname. Si hay varias conexiones activas con esa misma IP, todas son expulsadas.
- En ventanas privadas, los controles de bloquear/desbloquear y cerrar ahora usan iconos compactos, especialmente en móvil.
