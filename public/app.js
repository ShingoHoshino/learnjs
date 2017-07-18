'use strict';

var learnjs = {
  poolId: 'us-east-1:5c926216-6a82-444a-800f-f3fa1a334f6c',
  popularAnswerUrl: 'https://947b3ijysb.execute-api.us-east-1.amazonaws.com/prod'
};

learnjs.identity = new $.Deferred();

learnjs.problems = [
  {
    description: "What is truth?",
    code: "function problem() { return __; }"
  },
  {
    description: "Simple Math",
    code: "function problem() { return 42 === 6 * __; }" 
  }
];

learnjs.applyObject = function(obj, elem) {
  for (var key in obj) {
    elem.find('[data-name="' + key + '"]').text(obj[key]);
  }
}

learnjs.triggerEvent = function(name, args) {
  $('.view-container>*').trigger(name, args);
}

// フェードアウトとフェードインの実行
learnjs.flashElement = function(elem, content) {
  elem.fadeOut('fast', function() {
    elem.html(content);
    elem.fadeIn();
  });
}

// ランディング用のビュー関数
learnjs.landingView = function() {
  return learnjs.template('landing-view');
}

// テンプレートのクローンを生成する
learnjs.template = function(name) {
  return $('.templates .' + name).clone();
}

// 正解時のHTMLコンポーネント
learnjs.buildCorrectFlash = function(problemNum) {
  var correctFlash = learnjs.template('correct-flash');
  var link = correctFlash.find('a');
  if (problemNum < learnjs.problems.length) {
    // 次の問題を表示する
    link.attr('href', '#problem-' + (problemNum + 1));
  } else {
    // ランディングページに遷移
    link.attr('href', '');
    link.text('You are finished!');
  }
  return correctFlash;
}

learnjs.sendAwsRequest = function(req, retry) {
  var promise = new $.Deferred();
  req.on('error', function(error) {
    if (error.code === "CredentialsError") {
      learnjs.identity.then(function(identity) {
        return identity.refresh().then(function() {
          return retry();
        }, function() {
          promise.reject(resp);
        });
      });
    } else {
      promise.reject(error);
    }
  });
  req.on('success', function(resp) {
    promise.resolve(resp.data);
  });
  req.send();
  return promise;
}


learnjs.popularAnswers = function(problemId, view) {
  return learnjs.identity.then(function() {

    /***
    console.log(AWS.config.credentials.accessKeyId);
    console.log(AWS.config.credentials.secretAccessKey);
    console.log(AWS.config.credentials.sessionToken);
    ***/

    var apigClient = new apigClientFactory.newClient({
      accessKey: AWS.config.credentials.accessKeyId,
      secretKey: AWS.config.credentials.secretAccessKey,
      sessionToken: AWS.config.credentials.sessionToken,
      region: 'us-east-1'
    });
    var params = JSON.stringify({problemNumber: problemId});
    var param = {};
    var body = {
      problemNumber: problemId
    };

    return apigClient.popularAnswersPost(param, body, {}).then(function(result) {
      var json = JSON.stringify(result.data);
      console.log('Result', json)
      var popanswer = view.find('.popanswer');
      popanswer.html(json);
    });
  });
}

learnjs.fetchAnswer = function(problemId) {
  return learnjs.identity.then(function(identity) {
    var db = new AWS.DynamoDB.DocumentClient();
    var item = {
      TableName: 'learnjs',
      Key: {
        userId: identity.id,
        problemId: problemId
      }
    };
    return learnjs.sendDbRequest(db.get(item), function() {
      return learnjs.fetchAnswer(problemId);
    })
  });
};


learnjs.problemView = function(data) {
  var problemNumber = parseInt(data, 10);
  var view = $('.templates .problem-view').clone();
  var problemData = learnjs.problems[problemNumber - 1];
  var resultFlash = view.find('.result');
  var answer = view.find('.answer');

  function checkAnswer() {
    var test = problemData.code.replace('__', answer.val()) + '; problem()';
    return eval(test);
  }

  function checkAnswerClick() {
    if (checkAnswer()) {
      // 次の問題を表示する
      var flashContents = learnjs.buildCorrectFlash(problemNumber);
      learnjs.flashElement(resultFlash, flashContents);
      learnjs.saveAnswer(problemNumber, answer.val());
    } else {
      learnjs.flashElement(resultFlash, 'Incorrect!');
    }
    return false;
  }
  
  if (problemNumber < learnjs.problems.length) {
    var buttonItem = learnjs.template('skip-btn');
    buttonItem.find('a').attr('href', '#problem-' + (problemNumber + 1));
    $('.nav-list').append(buttonItem);
    view.bind('removingView', function() {
      buttonItem.remove();
    });
  }

  learnjs.popularAnswers(problemNumber, view);

  learnjs.fetchAnswer(problemNumber).then(function(data) {
    if (data.Item) {
      answer.val(data.Item.answer);
    }
  });

  view.find('.check-btn').click(checkAnswerClick);
  view.find('.title').text('Problem #' + problemNumber);
  learnjs.applyObject(problemData, view);
  return view;
}

// プロファイルの表示
learnjs.profileView = function() {
  var view = learnjs.template('profile-view');
  learnjs.identity.done(function(identity) {
    view.find('.email').text(identity.email);
  });
  return view;
}

learnjs.showView = function(hash) {
  var routes = {
    '#problem' : learnjs.problemView,
    '#profile' : learnjs.profileView,
    '#': learnjs.landingView,
    '': learnjs.landingView
  };

  var hashParts = hash.split('-');
  var viewFn = routes[hashParts[0]];
  if (viewFn) {
    learnjs.triggerEvent('removingView', []);
    $('.view-container').empty().append(viewFn(hashParts[1]));
  }
}

learnjs.appOnReady = function() {
  window.onhashchange = function() {
    learnjs.showView(window.location.hash);
  };
  learnjs.showView(window.location.hash);
  learnjs.identity.done(learnjs.addProfileLink);
}

learnjs.countAnswers = function(problemId) {
  return learnjs.identity.then(function(identity) {
    var db = new AWS.DynamoDB.DocumentClient();
    var params = {
      TableName: 'learnjs',
      Select: 'COUNT',
      FilterExpression: 'problemId = :problemId',
      ExpressionAttributeValues: {':problemId': problemId}
    };
    return learnjs.sendDbRequest(db.scan(params), function() {
      return learnjs.countAnswers(problemId);
    })
  });
}

learnjs.saveAnswer = function(problemId, answer) {
  return learnjs.identity.then(function(identity) {
    var db = new AWS.DynamoDB.DocumentClient();
    var item = {
      TableName: 'learnjs',
      Item: {
        userId: identity.id,
        problemId: problemId,
        answer: answer
      }
    };
    return learnjs.sendDbRequest(db.put(item), function() {
      return learnjs.saveAnswer(problemId, answer);
    })
  });
}  

learnjs.sendDbRequest = function(req, retry) {
  var promise = new $.Deferred();
  req.on('error', function(error) {
    if (error.code == "CredentialsError") {
      learnjs.identity.then(function(identity) {
        return identity.refresh().then(function() {
          return retry();
        }, function() {
          promise.reject(req);
        });
      });
    } else {
      promise.reject(error);
    }
  });
  req.on('success', function(resp) {
    promise.resolve(resp.data);
  });
  req.send();
  return promise;
}

learnjs.addProfileLink = function(profile) {
  var link = learnjs.template('profile-link');
  link.find('a').text(profile.email);
  $('.signin-bar').prepend(link);
}

learnjs.awsRefresh = function() {
  var deferred = new $.Deferred();
  AWS.config.credentials.refresh(function(err) {
    if (err) {
      deferred.reject(err);
    } else {
      deferred.resolve(AWS.config.credentials.identityId);
    }
  });
  return deferred.promise();
}

function googleSignIn(googleUser) {
  // ログイン成功時の認証情報の生成
  var id_token = googleUser.getAuthResponse().id_token;
  AWS.config.update({
    region: 'us-east-1',
    credentials: new AWS.CognitoIdentityCredentials({
      IdentityPoolId: learnjs.poolId,
      Logins: {
        'accounts.google.com': id_token
      }
    })
  });
  function refresh() {
    return gapi.auth2.getAuthInstance().signIn({
        prompt: 'login'
      }).then(function(userUpdate) {
      var creds = AWS.config.credentials;
      var newToken = userUpdate.getAuthResponse().id_token;
      creds.params.Logins['accounts.google.com'] = newToken;
      return learnjs.awsRefresh();
    });
  }
  learnjs.awsRefresh().then(function(id) {
    learnjs.identity.resolve({
      id: id,
      email: googleUser.getBasicProfile().getEmail(),
      refresh: refresh
    });
  });
}
