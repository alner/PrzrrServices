Для функционирования в продакшн среде используем модуль pm2 (https://github.com/Unitech/pm2).

npm install pm2 -g

Запуск сервиса:

> pm2 start server.js

"кластерный" вариант (несколько потоков)

> pm2 start server.js -i 4

-i <number of workers> 

Список процессов:

> pm2 list

Перезапустить все процессы (по очереди, функционирование сервиса сохраняется)

> pm2 restart all

или

pm2 restart <app name>

> pm2 restart server

Масштабирование сервиса:

pm2 scale <app name> <n>

Например, 
> pm2 scale app +3
> pm2 scale app 

Остановить все сервисы

> pm2 stop all

> pm2 kill
