// ============================================
// WARD ACADEMY — RESEARCH FOLDERS & FILE UPLOAD API
// Google Apps Script backend for the Research page
// v2.7 — adds listProjectTree (live folder listing)
// ============================================
//
// This file is the source of truth for the Apps Script deployment that the
// Research page talks to. Keeping it in the repo means the backend isn't only
// living inside one Google account.
//
// HOW TO DEPLOY
//   1. Open https://script.google.com and open the existing project
//   2. Select all the old code (Ctrl+A) and paste this file over it
//   3. Fill in RESEARCH_PARENT_FOLDER_ID below (see the note next to it)
//   4. Ctrl+S to save
//   5. Deploy > Manage deployments > Edit (pencil)
//   6. Version: "New version" · Execute as: "Me" · Who has access: "Anyone"
//   7. Deploy. The /exec URL must match GOOGLE_APPS_SCRIPT_URL in research.html
//
// WHAT'S NEW IN v2.7
//   `listProjectTree` walks the project folder in Drive and returns the real
//   tree (subfolders + files, at any depth). The Research page uses it to show
//   what is actually in Drive right now — so folders you add, rename or delete
//   by hand appear on the site — and falls back to the database snapshot when
//   this action isn't deployed yet.

// ============================================
// CONFIGURATION
// ============================================

// Parent folder where project folders get created.
// NOTE: kept out of the repo on purpose — this repository is public, and the
// project folders are shared "anyone with the link can edit". Paste the real
// folder ID here in the Apps Script editor, not in git.
const RESEARCH_PARENT_FOLDER_ID = 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE';

// Folder for generic uploads (kept for backwards compatibility).
const GENERAL_UPLOAD_FOLDER_ID = RESEARCH_PARENT_FOLDER_ID;

// Safety cap so a deeply nested folder can never spin the listing forever.
const MAX_TREE_DEPTH = 5;

// ============================================
// HELPERS
// ============================================

function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeSharingSet(driveItem, access, permission) {
  try {
    driveItem.setSharing(access, permission);
    return true;
  } catch (e) {
    Logger.log('setSharing failed (policy may block public sharing): ' + e.toString());
    return false;
  }
}

// ============================================
// GET REQUESTS
// ============================================

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;

    // DELETE A FILE
    if (action === 'deleteFile' && e.parameter.fileId) {
      const file = DriveApp.getFileById(e.parameter.fileId);
      file.setTrashed(true);
      result = { success: true, message: 'File moved to trash' };
    }

    // LIST THE FILES OF ONE FOLDER
    else if (action === 'list') {
      const folderId = e.parameter.folderId || GENERAL_UPLOAD_FOLDER_ID;
      const folder = DriveApp.getFolderById(folderId);
      const files = folder.getFiles();
      const fileList = [];
      while (files.hasNext()) fileList.push(getFileInfo(files.next()));
      fileList.sort(function (a, b) { return new Date(b.dateCreated) - new Date(a.dateCreated); });
      result = { success: true, count: fileList.length, files: fileList };
    }

    // API STATUS
    else {
      result = {
        success: true,
        message: 'Ward Academy Research Folders API v2.7',
        status: 'Working — project folders, missing-folder check, uploads and live tree listing',
        timestamp: new Date().toISOString(),
        endpoints: {
          'POST createProjectFolder': 'Creates the project folder structure',
          'POST checkAndCreateMissingFolders': 'Creates any missing standard subfolders',
          'POST listProjectTree': 'Returns the real folder/file tree of a project (live)',
          'POST uploadToFolder': 'Uploads a file into a specific folder',
          'GET deleteFile': 'Moves a file to the trash',
          'GET list': 'Lists the files of a folder'
        }
      };
    }

    return createJsonResponse(result);
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString(), stack: error.stack });
  }
}

// ============================================
// POST REQUESTS
// ============================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result;

    if (action === 'createProjectFolder') {
      result = createProjectFolderStructure(data.projectTitle);
    }
    else if (action === 'checkAndCreateMissingFolders') {
      result = checkAndCreateMissingFolders(data.mainFolderId);
    }
    // NEW in v2.7 — what the Research page calls to show the live tree.
    else if (action === 'listProjectTree') {
      result = listProjectTree(data.mainFolderId);
    }
    else if (action === 'uploadToFolder') {
      result = uploadFileToFolder(data.folderId, data.fileName, data.fileContent, data.mimeType);
    }
    else {
      result = uploadFileToFolder(GENERAL_UPLOAD_FOLDER_ID, data.fileName, data.fileContent, data.mimeType);
    }

    return createJsonResponse(result);
  } catch (error) {
    return createJsonResponse({ success: false, error: error.toString(), stack: error.stack });
  }
}

// ============================================
// LIST THE REAL PROJECT TREE  (v2.7)
// ============================================

function listProjectTree(mainFolderId) {
  try {
    if (!mainFolderId) return { success: false, error: 'mainFolderId is required' };
    const folder = DriveApp.getFolderById(mainFolderId);
    return { success: true, tree: readFolderNode(folder, 0) };
  } catch (error) {
    return { success: false, error: error.toString(), stack: error.stack };
  }
}

// Recursively reads one folder into { id, name, url, folders[], files[] }.
// Trashed items are skipped by DriveApp, so deleting in Drive removes it here too.
function readFolderNode(folder, depth) {
  const node = {
    id: folder.getId(),
    name: folder.getName(),
    url: folder.getUrl(),
    folders: [],
    files: []
  };

  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    node.files.push({
      id: f.getId(),
      name: f.getName(),
      url: 'https://drive.google.com/file/d/' + f.getId() + '/view',
      mimeType: f.getMimeType(),
      size: f.getSize()
    });
  }
  node.files.sort(function (a, b) { return a.name.localeCompare(b.name); });

  if (depth < MAX_TREE_DEPTH) {
    const subs = folder.getFolders();
    while (subs.hasNext()) node.folders.push(readFolderNode(subs.next(), depth + 1));
    node.folders.sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  return node;
}

// ============================================
// CREATE THE PROJECT FOLDER STRUCTURE
// ============================================

// The standard layout, in order. Kept as data so the creation routine and the
// missing-folder check can't disagree about what "standard" means.
const PROJECT_STRUCTURE = [
  ['PROTOCOL', []],
  ['DATABASES', []],
  ['FULL TEXT REVIEW', []],
  ['INCLUDED', []],
  ['DATA EXTRACTION', ['FOREST PLOTS']],
  ['RISK OF BIAS', []],
  ['SUBMISSION', ['TABLES', 'FIGURES', 'ABSTRACT', 'MANUSCRIPT', 'SUPPLEMENTARY', 'COVER LETTER']]
];

function createProjectFolderStructure(projectTitle) {
  try {
    const parentFolder = DriveApp.getFolderById(RESEARCH_PARENT_FOLDER_ID);
    const mainFolder = parentFolder.createFolder(projectTitle);
    safeSharingSet(mainFolder, DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);

    const subfolders = {};
    for (let i = 0; i < PROJECT_STRUCTURE.length; i++) {
      const name = PROJECT_STRUCTURE[i][0];
      const children = PROJECT_STRUCTURE[i][1];

      const folder = mainFolder.createFolder(name);
      safeSharingSet(folder, DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
      subfolders[name] = { id: folder.getId(), url: folder.getUrl() };

      if (children.length) {
        subfolders[name].subfolders = {};
        for (let j = 0; j < children.length; j++) {
          const sub = folder.createFolder(children[j]);
          safeSharingSet(sub, DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
          subfolders[name].subfolders[children[j]] = { id: sub.getId(), url: sub.getUrl() };
        }
      }
    }

    return {
      success: true,
      folderStructure: {
        mainFolderName: projectTitle,
        mainFolderId: mainFolder.getId(),
        mainFolderUrl: mainFolder.getUrl(),
        subfolders: subfolders
      }
    };
  } catch (error) {
    return { success: false, error: error.toString(), stack: error.stack };
  }
}

// ============================================
// CHECK AND CREATE MISSING FOLDERS
// ============================================

function checkAndCreateMissingFolders(mainFolderId) {
  try {
    const mainFolder = DriveApp.getFolderById(mainFolderId);

    const existingMainFolders = {};
    const mainFolders = mainFolder.getFolders();
    while (mainFolders.hasNext()) {
      const f = mainFolders.next();
      existingMainFolders[f.getName().toUpperCase()] = f;
    }

    const created = [];
    const alreadyExists = [];

    for (let i = 0; i < PROJECT_STRUCTURE.length; i++) {
      const folderName = PROJECT_STRUCTURE[i][0];
      const expectedSubfolders = PROJECT_STRUCTURE[i][1];
      let folder;

      if (existingMainFolders[folderName.toUpperCase()]) {
        folder = existingMainFolders[folderName.toUpperCase()];
        alreadyExists.push(folderName);
      } else {
        folder = mainFolder.createFolder(folderName);
        safeSharingSet(folder, DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
        created.push({ name: folderName, id: folder.getId(), url: folder.getUrl(), parent: mainFolder.getName() });
      }

      if (expectedSubfolders.length > 0) {
        const existingSubs = {};
        const subs = folder.getFolders();
        while (subs.hasNext()) {
          const s = subs.next();
          existingSubs[s.getName().toUpperCase()] = s;
        }
        for (let j = 0; j < expectedSubfolders.length; j++) {
          const subName = expectedSubfolders[j];
          if (existingSubs[subName.toUpperCase()]) {
            alreadyExists.push(folderName + ' > ' + subName);
          } else {
            const sub = folder.createFolder(subName);
            safeSharingSet(sub, DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
            created.push({ name: subName, id: sub.getId(), url: sub.getUrl(), parent: folderName });
          }
        }
      }
    }

    return {
      success: true,
      created: created,
      createdCount: created.length,
      alreadyExistsCount: alreadyExists.length,
      alreadyExists: alreadyExists
    };
  } catch (error) {
    return { success: false, error: error.toString(), stack: error.stack };
  }
}

// ============================================
// UPLOAD A FILE INTO A FOLDER
// ============================================

function uploadFileToFolder(folderId, fileName, fileContent, mimeType) {
  try {
    const decoded = Utilities.base64Decode(fileContent);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const folder = DriveApp.getFolderById(folderId);
    const file = folder.createFile(blob);

    // May fail if the account policy blocks link sharing — not fatal.
    safeSharingSet(file, DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      success: true,
      fileId: file.getId(),
      fileName: file.getName(),
      fileUrl: file.getUrl(),
      viewLink: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      mimeType: file.getMimeType(),
      size: file.getSize(),
      dateCreated: file.getDateCreated().toISOString()
    };
  } catch (error) {
    return { success: false, error: error.toString(), stack: error.stack };
  }
}

// ============================================
// FILE INFO
// ============================================

function getFileInfo(file) {
  const mimeType = file.getMimeType();
  return {
    fileId: file.getId(),
    fileName: file.getName(),
    fileUrl: file.getUrl(),
    viewLink: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    mimeType: mimeType,
    size: file.getSize(),
    dateCreated: file.getDateCreated().toISOString(),
    isImage: mimeType.indexOf('image/') === 0,
    isPDF: mimeType === 'application/pdf',
    isVideo: mimeType.indexOf('video/') === 0
  };
}

// ============================================
// FOLDER STRUCTURE CREATED
// ============================================
/*
📁 [Project name]
├── 📁 PROTOCOL
├── 📁 DATABASES
├── 📁 FULL TEXT REVIEW
├── 📁 INCLUDED
├── 📁 DATA EXTRACTION
│   └── 📁 FOREST PLOTS
├── 📁 RISK OF BIAS
└── 📁 SUBMISSION
    ├── 📁 TABLES
    ├── 📁 FIGURES
    ├── 📁 ABSTRACT
    ├── 📁 MANUSCRIPT
    ├── 📁 SUPPLEMENTARY
    └── 📁 COVER LETTER

All folders shared as "anyone with the link can edit".
Once created, the Research page shows whatever is actually in Drive — add,
rename or delete folders there and the site follows.
*/
