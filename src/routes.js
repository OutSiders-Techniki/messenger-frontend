import { loginScreen } from './screens/login.js';
import { registerScreen } from './screens/register.js';
import { registerDoneScreen } from './screens/register-done.js';
import {
  accountScreen,
  chatScreen,
  dialogKeyScreen,
  dialogsScreen,
  searchScreen,
} from './screens/app-screens.js';
import { notFoundScreen } from './screens/not-found.js';

export const routes = [
  { path: '/login', screen: loginScreen, access: 'guest', title: 'Вход' },
  { path: '/register', screen: registerScreen, access: 'guest', title: 'Регистрация' },
  { path: '/register/done', screen: registerDoneScreen, access: 'guest', title: 'Аккаунт создан' },
  { path: '/dialogs', screen: dialogsScreen, access: 'auth', title: 'Диалоги' },
  { path: '/search', screen: searchScreen, access: 'auth', title: 'Новый диалог' },
  { path: '/dialogs/:dialogId', screen: chatScreen, access: 'auth', title: 'Диалог' },
  { path: '/dialogs/:dialogId/key', screen: dialogKeyScreen, access: 'auth', title: 'Ключ диалога' },
  { path: '/account', screen: accountScreen, access: 'auth', title: 'Аккаунт' },
  { path: '*',screen: notFoundScreen, access: 'any', title: 'Не найдено' },
];
