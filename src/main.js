import { Game } from "./game/Game.js";
import { BootScene } from "./scenes/BootScene.js";
import { ChapterOneScene } from "./scenes/ChapterOneScene.js";

const canvas = document.querySelector("#game");
const game = new Game(canvas);
const bootScene = new BootScene(game);

game.sceneManager.register("boot", bootScene);
game.sceneManager.register("chapter-1", new ChapterOneScene(game, bootScene));

game.start("boot");

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}
