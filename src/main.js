import { Game } from "./game/Game.js";
import { BootScene } from "./scenes/BootScene.js";

const canvas = document.querySelector("#game");
const game = new Game(canvas);

game.sceneManager.register("boot", new BootScene(game));

game.start("boot");
