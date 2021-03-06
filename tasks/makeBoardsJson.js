const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const globule = require('globule')
const utils = require('./utils/utils')
const cp = require('child_process')
const {repoToFolder} = require('../scripts/utils')

const boardDir = 'boards'

if (require.main !== module) {
  module.exports = function() {
    const deps = [boardDir]
    const targets = ['build/.temp/boards.json']
    const moduleDep = false
    return {deps, targets, moduleDep}
  }
} else {
  const {config, cached_build, deps, targets} = utils.processArgs(process.argv)
  const registry = require('../registry.json')
  let folders = registry.map(p => repoToFolder(p.repo))
  let boards = []
  if (cached_build) {
    let new_folders = []
    if (fs.existsSync('build/registry.json')) {
      const cached_registry = require('../build/registry.json')
      new_folders = registry
        .filter(
          project =>
            !cached_registry.find(
              p => p.repo === project.repo && p.hash === project.hash
            )
        )
        .map(p => repoToFolder(p.repo))
    }
    if (fs.existsSync('build/.temp/boards.json')) {
      boards = require('../build/.temp/boards.json')
    }
    // remove any boards that are being updated
    boards = boards.filter(x => {
      return !new_folders.find(
        folder => folder === x.fromMulti || folder === path.join('boards', x.id)
      )
    })
    folders = new_folders
  }

  for (const folder of folders) {
    let info
    let file
    if (fs.existsSync(`${folder}/kitnic.yaml`)) {
      file = fs.readFileSync(`${folder}/kitnic.yaml`)
    } else if (fs.existsSync(`${folder}/kitspace.yaml`)) {
      file = fs.readFileSync(`${folder}/kitspace.yaml`)
    } else if (fs.existsSync(`${folder}/kitspace.yml`)) {
      file = fs.readFileSync(`${folder}/kitspace.yml`)
    }
    if (file != null) {
      info = yaml.safeLoad(file)
    } else {
      info = {}
    }

    if (info.multi) {
      for (let project in info.multi) {
        info.multi[project].path = project
        const board = getBoardInfo(info.multi[project], folder)
        board.fromMulti = folder
        boards.push(board)
      }
    } else {
      boards.push(getBoardInfo(info, folder))
    }
  }

  shuffleArray(boards)

  const boardJson = fs.openSync(targets[0], 'w')
  fs.write(boardJson, JSON.stringify(boards), err => {
    if (err) {
      console.error(err)
      process.exit(1)
    }
  })
}

function getBoardInfo(project, folder) {
  let board = correctTypes(project)
  let projectFolder = folder

  if (project.path) {
    projectFolder = path.join(projectFolder, project.path)
  }

  board.id = path.relative(boardDir, projectFolder)

  if (board.summary === '' && /^github.com/.test(board.id)) {
    const ghInfo = getGithubInfo(folder)
    if (__guard__(ghInfo, x => x.description) != null) {
      board.summary = ghInfo.description
    } else {
      console.warn(`WARNING: could not get GitHub description for ${folder}`)
    }
  }
  return board
}

function getGithubInfo(folder) {
  const id = folder.replace(/^boards\/github.com/, '')
  let text
  const url = `https://api.github.com/repos${id}`
  //we use this to avoid being rate-limited
  if (process.env.GH_TOKEN != null) {
    text = cp.execSync(`curl -u kasbah:${process.env.GH_TOKEN} ${url}`)
  } else {
    console.warn('Using un-authenticated access to GitHub API')
    text = cp.execSync(`curl ${url}`)
  }
  return JSON.parse(text)
}

function correctTypes(boardInfo) {
  const boardInfoWithEmpty = {
    id: '',
    summary: ''
  }

  for (let prop in boardInfoWithEmpty) {
    if (boardInfo.hasOwnProperty(prop)) {
      boardInfoWithEmpty[prop] = String(boardInfo[prop])
    }
  }

  return boardInfoWithEmpty
}

function __guard__(value, transform) {
  return typeof value !== 'undefined' && value !== null
    ? transform(value)
    : undefined
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j], array[i]] // eslint-disable-line no-param-reassign
  }
}
