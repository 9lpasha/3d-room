import { Game } from "./game/Game.js";
import { BootScene } from "./scenes/BootScene.js";
import { ChapterOneScene } from "./scenes/ChapterOneScene.js";

const canvas = document.querySelector("#game");
const game = new Game(canvas);

game.sceneManager.register("boot", new BootScene(game));
game.sceneManager.register("chapter-1", new ChapterOneScene(game));

game.start("boot");
