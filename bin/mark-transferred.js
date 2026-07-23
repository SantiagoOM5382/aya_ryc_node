#!/usr/bin/env node

/**
 * CLI tool to mark a chat as transferred to advisor
 * Usage: npm run mark-transferred -- <userId>
 * Example: npm run mark-transferred -- 573248175348
 */

const { markAsTransferred, getReadyForTransferChats } = require('../src/advisorTransferTracker.js');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n❌ Error: Debe proporcionar un ID de usuario');
  console.log('\nUso: npm run mark-transferred -- <userId>');
  console.log('Ejemplo: npm run mark-transferred -- 573248175348\n');
  process.exit(1);
}

const userId = args[0];

// Verify user exists in ready list
const chats = getReadyForTransferChats();
const chat = chats.find(c => c.userId === userId);

if (!chat || chat.transferred) {
  console.log(`\n❌ Error: No se encontró un chat listo para transferir con ID: ${userId}\n`);
  console.log('Chats listos para transferir:');
  const readyChats = chats.filter(c => !c.transferred);
  if (readyChats.length === 0) {
    console.log('  (ninguno)');
  } else {
    readyChats.forEach(c => console.log(`  - ${c.userId}`));
  }
  console.log('');
  process.exit(1);
}

// Mark as transferred
const success = markAsTransferred(userId);

if (success) {
  console.log(`\n✅ Chat ${userId} marcado como transferido correctamente\n`);
  process.exit(0);
} else {
  console.log(`\n❌ Error al marcar como transferido\n`);
  process.exit(1);
}
