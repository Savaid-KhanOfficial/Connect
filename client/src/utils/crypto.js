import EC from 'elliptic';
import CryptoJS from 'crypto-js';

const ec = new EC.ec('secp256k1');

/**
 * Generate a new ECDH key pair
 * @returns {Object} { privateKey: string, publicKey: string }
 */
export function generateKeyPair() {
  const keyPair = ec.genKeyPair();
  const privateKey = keyPair.getPrivate('hex');
  const publicKey = keyPair.getPublic('hex');
  
  return { privateKey, publicKey };
}

/**
 * Get or generate private key from localStorage
 * @returns {string} privateKey (hex string)
 */
export function getOrGeneratePrivateKey() {
  let privateKey = localStorage.getItem('chat_private_key');
  
  if (!privateKey) {
    const { privateKey: newPrivateKey, publicKey } = generateKeyPair();
    localStorage.setItem('chat_private_key', newPrivateKey);
    localStorage.setItem('chat_public_key', publicKey);
    privateKey = newPrivateKey;
  }
  
  return privateKey;
}

/**
 * Get public key from private key
 * @param {string} privateKeyHex - Private key in hex format
 * @returns {string} publicKey (hex string)
 */
export function getPublicKeyFromPrivate(privateKeyHex) {
  const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
  return keyPair.getPublic('hex');
}

/**
 * Derive shared secret using ECDH
 * @param {string} myPrivateKeyHex - My private key (hex)
 * @param {string} friendPublicKeyHex - Friend's public key (hex)
 * @returns {string} sharedSecret (hex string) - Used as AES key
 */
export function deriveSharedSecret(myPrivateKeyHex, friendPublicKeyHex) {
  try {
    const myKeyPair = ec.keyFromPrivate(myPrivateKeyHex, 'hex');
    const friendPublicKey = ec.keyFromPublic(friendPublicKeyHex, 'hex');
    
    // Derive the shared secret
    const sharedSecret = myKeyPair.derive(friendPublicKey.getPublic());
    
    // Convert to hex string for use as AES key
    return sharedSecret.toString(16);
  } catch (error) {
    console.error('Error deriving shared secret:', error);
    return null;
  }
}

/**
 * Encrypt a message using AES
 * @param {string} plaintext - Message to encrypt
 * @param {string} sharedSecretHex - Shared secret (hex string)
 * @returns {string} ciphertext
 */
export function encryptMessage(plaintext, sharedSecretHex) {
  try {
    const ciphertext = CryptoJS.AES.encrypt(plaintext, sharedSecretHex).toString();
    return ciphertext;
  } catch (error) {
    console.error('Error encrypting message:', error);
    return null;
  }
}

/**
 * Decrypt a message using AES
 * @param {string} ciphertext - Encrypted message
 * @param {string} sharedSecretHex - Shared secret (hex string)
 * @returns {string} plaintext or null if decryption fails
 */
export function decryptMessage(ciphertext, sharedSecretHex) {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, sharedSecretHex);
    const plaintext = bytes.toString(CryptoJS.enc.Utf8);
    
    if (!plaintext) {
      return null;
    }
    
    return plaintext;
  } catch (error) {
    console.error('Error decrypting message:', error);
    return null;
  }
}

/**
 * Initialize encryption for a user on login
 * @returns {Object} { privateKey: string, publicKey: string }
 */
export function initializeEncryption() {
  const privateKey = getOrGeneratePrivateKey();
  const publicKey = getPublicKeyFromPrivate(privateKey);
  
  // Store public key for easy access
  localStorage.setItem('chat_public_key', publicKey);
  
  return { privateKey, publicKey };
}

/**
 * Clear encryption keys (on logout)
 */
export function clearEncryptionKeys() {
  localStorage.removeItem('chat_private_key');
  localStorage.removeItem('chat_public_key');
}
