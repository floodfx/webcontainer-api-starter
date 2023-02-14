/** @satisfies {import('@webcontainer/api').FileSystemTree} */

export const files = {
  src: {
    directory: {
      client: {
        directory: {
          'index.ts': {
            file: {
              contents: `
import NProgress from "nprogress";
import { Socket } from "phoenix";
import "phoenix_html";
import { LiveSocket } from "phoenix_live_view";

const url = "/live";
let csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content");
let liveSocket = new LiveSocket(url, Socket, { params: { _csrf_token: csrfToken }, hooks: {} });
window.addEventListener("phx:refresh", (e) => {
  console.log("phx:refresh", e);
});

// Show progress bar on live navigation and form submits
window.addEventListener("phx:page-loading-start", (info) => NProgress.start());
window.addEventListener("phx:page-loading-stop", (info) => NProgress.done());

// connect if there are any LiveViews on the page
liveSocket.connect();

// expose liveSocket on window for web console debug logs and latency simulation:
// liveSocket.enableDebug();
// liveSocket.enableLatencySim(1000)
(window as any).liveSocket = liveSocket;
              `,
            }
          },
        }
      },
      server: {
        directory: {
          liveview: {
            directory: {
              'hello.ts': {
                file: {
                  contents: `
import { createLiveView, html } from "liveviewjs";

/**
 * A simple LiveView that toggles between "Hello" and "👋" when the button is clicked.
 */
export const helloLive = createLiveView({
  mount: (socket, _, params) => {
    socket.assign({ name: params.name || "LiveViewJS", useEmoji: true });
  },
  handleEvent(event, socket) {
    if (event.type === "toggle") {
      socket.assign({ useEmoji: !socket.context.useEmoji });
    }
  },
  render: (context) => {
    const { useEmoji, name } = context;
    const hello = useEmoji ? "👋" : "Hello";
    return html\`
      <div class="flex flex-col items-center space-y-10 pt-10">
        <div class="flex flex-col items-center space-y-5">
          <h1 class="text-2xl font-bold">\${hello} \${name}</h1>
          <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" phx-click="toggle">
            \${useEmoji ? "Use Text" : "Use Emoji"}
          </button>
        </div>
        <div class="text-center max-w-[200px]">
          More documentation and examples at
          <a class="text-blue-500" href="https://liveviewjs.com" target="_blank" rel="noopener noreferrer"
            >LiveViewJS.com</a
          >
        </div>
      </div>
    \`;
  },
});
                  `
                }
              },            
              'router.ts': {
                file: {
                  contents: `
import { LiveViewRouter } from "liveviewjs";
import { helloLive } from "./hello";

// configure LiveView routes for LiveViewJS
export const liveRouter: LiveViewRouter = {
  "/hello": helloLive,
  "/hello/:name": helloLive,
};
                  `
                }
              }
            },
          },
          'autorun.ts': {
            file: {
              contents: `
import chalk from "chalk";
import { ChildProcess, spawn } from "child_process";
import esbuild from "esbuild";

const outdir = "build";
let runner: ChildProcess;

function maybe_stop_child() {
  if (runner) {
    runner.kill();
  }
}

function run_child() {
  maybe_stop_child();
  runner = spawn("node", [\`\${outdir}/index.js\`]);
  runner.stdout!.on("data", (data) => process.stdout.write(chalk.blue(data.toString())));
  runner.stderr!.on("data", (data) => process.stderr.write(chalk.red(data.toString())));
}

function build_success() {
  console.log(chalk.green("build succeeded"));
  run_child();
}

function build_failure(error: unknown) {
  console.error(chalk.red("build failed"));
  console.error(error);
  maybe_stop_child();
}

// Build / watch the client code
esbuild
  .build({
    entryPoints: ["src/client/index.ts"],
    outdir: "public/js",
    bundle: true,
    format: "esm",
    platform: "browser",
    sourcemap: true,
    watch: {
      onRebuild(error) {
        if (error) {
          console.error("client rebuild failed");
          console.error(error);
        } else {
          console.log(chalk.green("client build succeeded"));
        }
      },
    },
  })
  .then((result) => {
    if (result.errors.length > 0) {
      console.error(result.errors);
    } else {
      console.log(chalk.green("client build succeeded"));
    }
  });

// Build / watch the server code
esbuild
  .build({
    entryPoints: ["src/server/index.ts"],
    outdir,
    bundle: true,
    format: "cjs",
    platform: "node",
    watch: {
      onRebuild(error) {
        if (error) {
          build_failure(error);
        } else {
          build_success();
        }
      },
    },
  })
  .then((result) => {
    if (result.errors.length > 0) {
      build_failure(result);
    } else {
      build_success();
    }
  });

              `
            },
          },
          'express.ts': {
            file: {
              contents: `
import express, { NextFunction, Request, Response } from "express";
import session, { MemoryStore } from "express-session";
import { LiveViewRouter } from "liveviewjs";

// declare flash object is added to session data in express-session middleware
declare module "express-session" {
interface SessionData {
  flash: any;
}
}

/**
 * Basic express configuration for LiveViewJS which includes:
 * - static file serving
 * - express-session middleware
 *
 * @param sessionSecret a secret key used to sign session cookies
 * @returns an express application
 */
export function configureExpress(sessionSecret: string) {
const app = express();

// add static file serving
app.use(express.static("public"));

// configure express-session middleware
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    rolling: true,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    store: new MemoryStore(),
  })
);

return app;
}

/**
 * Express middleware that logs requests to the console including:
 * - the request method
 * - whether the request is for a LiveView route
 * - the request url
 * - the current date and time
 * @param router the LiveViewRouter used to determine if a request is for a LiveView route
 * @returns the middleware function
 */
export function logRequests(router: LiveViewRouter): (req: Request, res: Response, next: NextFunction) => void {
return async (req: Request, res: Response, next: NextFunction) => {
  const isLiveView = router.hasOwnProperty(req.path);
  console.log(\`\${req.method} \${isLiveView ? "LiveView" : ""} \${req.url} - \${new Date().toISOString()}\`);
  next();
};
}

/**
 * Route that Redirects the user from the root path to the /hello path
 */
export function indexHandler(req: Request, res: Response) {
res.redirect("/hello");
}
              `
            },              
          },
          'index.ts': {
            file: {
              contents: `
import { NodeExpressLiveViewServer } from "@liveviewjs/express";
import { Server } from "http";
import { WebSocketServer } from "ws";
import { configureExpress, indexHandler, logRequests } from "./express";
import { htmlPageTemplate } from "./liveTemplates";
import { liveRouter } from "./liveview/router";

// basic server options
const signingSecret = process.env.SESSION_SECRET ?? "MY_VERY_SECRET_KEY";
const port = process.env.PORT ?? 4001;

// configure LiveViewJS server
const liveServer = new NodeExpressLiveViewServer(liveRouter, htmlPageTemplate, signingSecret, {
title: "LiveViewJS",
suffix: " · LiveViewJS",
});

// configure express server
const express = configureExpress(signingSecret);
express.use(liveServer.httpMiddleware); // allow LiveViewJS to handle LiveView http requests
express.use(logRequests(liveRouter)); // middleware to log requests
express.get("/", indexHandler); // index route handler

// configure http server to send requests to express
const server = new Server();
server.on("request", express);

// configure websocket server to send requests to LiveViewJS
const ws = new WebSocketServer({ server });
ws.on("connection", liveServer.wsMiddleware);

// listen for requests
server.listen(port, () => {
console.log(\`LiveViewJS is listening at: http://localhost:\${port}\`);
});
              `
            },
          },
          'liveTemplates.ts': {
            file: {
              contents: `
import { html, LiveTitleOptions, LiveViewHtmlPageTemplate, LiveViewTemplate, live_title_tag, safe } from "liveviewjs";

/**
 * Minimal HTML page template that embeds your LiveViews.  LiveViewJS will provide
 * the params to this function when rendering your LiveViews. You must use the
 * LiveViewJS html template tag to create your LiveViewTemplate.
 * @param liveTitleOptions the LiveTitleOptions allowing dynamic page titles
 * @param csrfToken the CSRF token value that prevents cross-site request forgery
 * @param liveViewContent the liveViewContent to embed in the page
 * @returns the LiveViewTemplate for the page
 */
export const htmlPageTemplate: LiveViewHtmlPageTemplate = (
  liveTitleOptions: LiveTitleOptions,
  csrfToken: string,
  liveViewContent: LiveViewTemplate
): LiveViewTemplate => {
  return html\`
    <!DOCTYPE html>
    <html lang="en" class="h-full bg-white">
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="csrf-token" content="\${csrfToken}" />
        \${live_title_tag(liveTitleOptions)}
        <!-- LiveViewJS Client Javascript - compiled from src/client/index.ts -->
        <script defer type="text/javascript" src="/js/index.js"></script>
        <!-- Tailwind CSS: we recommend replacing this with your own CSS -->
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <!-- Embedded LiveView -->
        \${safe(liveViewContent)}
      </body>
    </html>
  \`;
};
              `
            },
          },          
        }
      }
    }
  },
    
  'package.json': {
    file: {
      contents: `
{
"name": "LiveViewJS",
"version": "0.0.1",
"description": "A starter project for LiveViewJS with NodeJS",
"scripts": {
  "dev": "ts-node ./src/server/autorun.ts",
  "clean": "rm -rf build; rm -rf dist",
  "format": "prettier --write '**/*.{ts,js,json,html,css}'"
},
"keywords": [
  "liveviewjs",
  "liveview",
  "phoenix",
  "typescript",
  "javascript",
  "express"
],
"dependencies": {
  "@liveviewjs/express": "*",
  "express": "^4.17.2",
  "express-session": "^1.17.2",
  "jsonwebtoken": "^8.5.1",
  "liveviewjs": "*",
  "nanoid": "^3.2.0",
  "ws": "^8.8.1"
},
"devDependencies": {
  "@types/express": "^4.17.13",
  "@types/express-session": "^1.17.4",
  "@types/jsonwebtoken": "^8.5.8",
  "@types/node": "^18.7.8",
  "@types/nprogress": "^0.2.0",
  "@types/phoenix": "^1.5.4",
  "@types/phoenix_live_view": "^0.15.1",
  "@types/ws": "^8.5.3",
  "chalk": "^4.1.2",
  "esbuild": "^0.14.53",
  "nprogress": "^0.2.0",
  "phoenix": "^1.6.12",
  "phoenix_html": "^3.2.0",
  "phoenix_live_view": "^0.18.0",
  "tailwindcss": "^3.2.4",
  "ts-node": "^10.9.1",
  "typescript": "^4.5.4"
}
}
        `,
    },
  },
  'tsconfig.json': {
    file: {
      contents: `
{
"compilerOptions": {
  "module": "commonjs",
  "esModuleInterop": true,
  "noEmitOnError": true,
  "noFallthroughCasesInSwitch": true,
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "strictPropertyInitialization": false,
  "declaration": true,
  "resolveJsonModule": true,
  "strict": true,
  "skipLibCheck": true,
  "target": "es2019",
  "moduleResolution": "node",
  "lib": ["es2019", "esnext.asynciterable"],
  "types": ["node"],
  "outDir": "./build",
  "baseUrl": "."
},
"include": ["./src/**/*"],
"exclude": ["build", "node_modules", "./**/*.test.ts", "./src/client/**/*"]
}

      `
    },
  },
  'tsconfig.client.json': {
    file: {
      contents: `
{
"compilerOptions": {
  "module": "commonjs",
  "esModuleInterop": true,
  "noEmitOnError": true,
  "noFallthroughCasesInSwitch": true,
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "strictPropertyInitialization": false,
  "declaration": true,
  "resolveJsonModule": true,
  "strict": true,
  "skipLibCheck": true,
  "target": "ES2020",
  "moduleResolution": "node",
  "lib": ["DOM"],
  "types": ["node"],
  "outDir": "./build",
  "baseUrl": "."
},
"include": ["./src/client/*"],
"exclude": ["build", "node_modules", "./**/*.test.ts"]
}
      
      `
    },
  },
};
