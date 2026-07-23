#!/usr/bin/env node

/**
 * CLI tool to check chats ready for transfer to advisor
 * Usage: npm run check-transfers
 */

const {
  getReadyForTransferChats,
  markAsTransferred
} = require('../src/advisorTransferTracker.js');

function main() {
  console.clear();
  const allChats = getReadyForTransferChats();
  const readyChats = allChats.filter(c => !c.transferred);
  const transferredChats = allChats.filter(c => c.transferred);

  if (allChats.length === 0) {
    console.log('\n✅ No hay registros de transferencias en el sistema aún.\n');
    return;
  }

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║    🔄 CHATS LISTOS PARA TRANSFERIR A ASESOR DE RESERVAS     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Show ready chats first
  if (readyChats.length > 0) {
    console.log('🟢 LISTOS PARA TRANSFERIR (acción requerida):');
    console.log('─'.repeat(64));
    readyChats.forEach((chat, index) => {
      const timeAgo = new Date(chat.readySince);
      console.log(`${index + 1}. Usuario: ${chat.userId}`);
      console.log(`   Listo desde: ${timeAgo.toLocaleString('es-CO')}`);
      console.log(`   Msg bot: "${chat.lastBotMessage}"`);
      console.log('');
    });
  } else {
    console.log('🟢 LISTOS PARA TRANSFERIR: (ninguno)\n');
  }

  // Show transferred chats
  if (transferredChats.length > 0) {
    console.log('🟡 YA TRANSFERIDOS (completados):');
    console.log('─'.repeat(64));
    transferredChats.forEach((chat, index) => {
      const transferred = new Date(chat.transferredAt);
      console.log(`${index + 1}. Usuario: ${chat.userId}`);
      console.log(`   Transferido: ${transferred.toLocaleString('es-CO')}`);
      console.log('');
    });
  }

  console.log('═'.repeat(64));
  console.log(`📊 Resumen:`);
  console.log(`   🟢 Listos para transferir: ${readyChats.length}`);
  console.log(`   🟡 Ya transferidos: ${transferredChats.length}`);
  console.log(`   📦 Total: ${allChats.length}`);
  console.log('═'.repeat(64) + '\n');
}

main();
