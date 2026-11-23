import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const SALT_ROUNDS = 10;
export const AUTH_COOKIE_NAME = 'lecturemind_token';

/**
 * Hashes a plain-text password using bcryptjs
 * @param {string} password
 * @returns {Promise<string>}
 */
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Compares a plain-text password against a stored bcrypt hash
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generates a signed JSON Web Token
 * @param {object} payload
 * @returns {string}
 */
export const generateToken = (payload) => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
};

/**
 * Verifies and decodes a JSON Web Token
 * @param {string} token
 * @returns {object}
 */
export const verifyToken = (token) => {
  return jwt.verify(token, config.jwtSecret);
};

/**
 * Attaches the auth JWT as a secure, HTTP-only cookie to the response
 * @param {import('express').Response} res
 * @param {string} token
 */
export const setAuthCookie = (res, token) => {
  const isProduction = config.nodeEnv === 'production';
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

/**
 * Clears the auth cookie from the response
 * @param {import('express').Response} res
 */
export const clearAuthCookie = (res) => {
  const isProduction = config.nodeEnv === 'production';
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax'
  });
};
