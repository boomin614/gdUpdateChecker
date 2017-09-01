//対象とするGoogleDriveフォルダのID　ブラウザでアクセスしてURL見れば分かる
var PHOTO_FOLDER_ID = "*************************";
//更新日時を記録するのスプレッドシートのID　ブラウザでアクセスしてURL見れば分かる
var UPDATE_SHEET_ID = "*************************";
//スプレッドシートのシート名（下に表示されるタブのやつ）
var UPDATE_SHEET_NAME = "シート1";
//宛先
var SEND_MAIL_ADDRESS = ["aaa@gmail.com", "bbb@gmail.com"]
//送り主
var SENDER_MAIL_ADDRESS = ["ccc@gmail.com"]

//フォルダ内を再帰的に探索してすべてのファイルIDを配列にして返す
function getAllFilesId(targetFolder) {
  var filesIdList = [];

  var files = targetFolder.getFiles();
  while (files.hasNext()) {
    filesIdList.push(files.next().getId());
  }

  var child_folders = targetFolder.getFolders();
  while (child_folders.hasNext()) {
    var child_folder = child_folders.next();
    filesIdList = filesIdList.concat(getAllFilesId(child_folder));
  }
  return filesIdList;
}

function updateCheck() {
  var photoFolder = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  var folders = photoFolder.getFolders();

  var folderData = {};

  // 写真フォルダ配下の最終更新日時を取得。
  while (folders.hasNext()) {
    var folder = folders.next();

    // フォルダ最終更新日時
    var lastFolderUpdateDate = folder.getLastUpdated();
    // フォルダ内のファイルの最終更新日時が新しい場合もあるのでそれに対応
    var files = folder.getFiles();
    while (files.hasNext()) {
      var fileobj = files.next();
      if (fileobj.getLastUpdated() > lastFolderUpdateDate) {
        // Logger.log("update LastUpdated: " + lastFolderUpdateDate + ", " + fileobj.getLastUpdated())
        lastFolderUpdateDate = fileobj.getLastUpdated();
      }
    }

    // 情報を連想配列に格納
    folderData[folder.getName()] = {
      name: folder.getName(),
      lastUpdate: lastFolderUpdateDate, // フォルダ最終更新日時
      filenum: getAllFilesId(folder).length, // フォルダ内のファイル数
      url: folder.getUrl(), // フォルダのURL
      diff: 0
    };

  }

  // スプレッドシートに記載されているフォルダ名と更新日時を取得。
  var spreadsheet = SpreadsheetApp.openById(UPDATE_SHEET_ID);
  var sheet = spreadsheet.getSheetByName(UPDATE_SHEET_NAME);
  var data = sheet.getDataRange().getValues();

  // 取得したデータをMapに変換。
  var sheetData = {};
  //  headerがあるので2から開始
  for (var i = 1; i < data.length; i++) {
    sheetData[data[i][0]] = {
      name: data[i][0],
      lastUpdate: data[i][1],
      filenum: data[i][2],
      url: data[i][3],
      rowNo: i + 1
    };
  }

  // 実際のフォルダとスプレッドシート情報を比較。
  var updateFolderList = [];
  for (key in folderData) {
    if (key in sheetData) {
      // フォルダ名がシートに存在する場合。
      if (folderData[key].lastUpdate > sheetData[key].lastUpdate | folderData[key].filenum != sheetData[key].filenum) {
        // フォルダが更新されているか、ファイルが追加されている場合。
        updateFolderList.push(key);
        folderData[key].diff = folderData[key].filenum - sheet.getRange(sheetData[key].rowNo, 3).getValue();
        Logger.log(key+", folderData[key].diff: " + folderData[key].diff);
        sheet.getRange(sheetData[key].rowNo, 2).setValue(folderData[key].lastUpdate);
        sheet.getRange(sheetData[key].rowNo, 3).setValue(folderData[key].filenum);
        sheet.getRange(sheetData[key].rowNo, 4).setValue(folderData[key].url);
      }
    } else {
      // フォルダ名がシートに存在しない場合。
      var lowno = sheet.getLastRow() + 1
      sheet.getRange(lowno, 1).setValue(key);
      sheet.getRange(lowno, 2).setValue(folderData[key].lastUpdate);
      sheet.getRange(lowno, 3).setValue(folderData[key].filenum);
      sheet.getRange(lowno, 4).setValue(folderData[key].url);
      updateFolderList.push(key);
    }
  }

  // 削除されたフォルダをチェックして、フォルダ一覧から削除
  var deleteFolderList = [];
  for (key in sheetData) {
    if (!(key in folderData)) {
      Logger.log(key + " is deleted. row" + sheetData[key].rowNo)
      sheet.deleteRow(sheetData[key].rowNo)
      deleteFolderList.push(key);
    }
  }

  // 新規及び更新された情報をメール送信。
  if (updateFolderList.length != 0 | deleteFolderList != 0) {

    var bodyText = photoFolder.getName() + "フォルダに、" + updateFolderList.length + "個のフォルダが追加(変更)されました。\n";
    bodyText += photoFolder.getUrl() + "\n\n";

    // フォルダ名、フォルダ更新日時、フォルダ内のファイル数
    if (updateFolderList != 0) {
      bodyText += "フォルダ名        \t枚数\tURL\n";
      for (key in updateFolderList) {
        fld = updateFolderList[key];
        bodyText += fld + "\t" + folderData[fld].filenum;
        if (folderData[fld].diff != 0) {
          //変更されたフォルダがある場合
          bodyText += "(" + folderData[fld].diff + ")";
        }
        bodyText += "枚" + "\t" + folderData[fld].url + "\n";
      }
    }

    if (deleteFolderList != 0) {
      bodyText += "\n以下のフォルダが削除されています。" + "\n";
      for (key in deleteFolderList) {
        fld = deleteFolderList[key];
        bodyText += fld + "\t" + sheetData[fld].filenum + "枚" + "\n";
      }
    }

    bodyText += "\n\nこのメールに返信しても見れませんので返信しないでください。";
    // Logger.log(bodyText)

    var titletext = "フォトアルバム【" + photoFolder.getName() + "】更新連絡通知";
    MailApp.sendEmail(DIST_MAIL_ADDRESS, SENDER_MAIL_ADDRESS, titletext, bodyText);

  } else {
    Logger.log("通知する更新情報がありません")
  }
}
