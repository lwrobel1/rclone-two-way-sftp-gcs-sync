node {
    def app

    stage('Log variables') {
        /* Let's make sure we have the repository cloned to our workspace */

        sh 'printenv'
    }

    stage('Clone repository') {
        /* Let's make sure we have the repository cloned to our workspace */

        checkout scm
    }

    stage('Build image') {
        /* This builds the actual image; synonymous to
         * docker build on the command line */

        def version = ''
        if ("${env.BRANCH_NAME}"" == "develop") {
            version = 'latest-dev'
        } else if ("${env.BRANCH_NAME}"" == "master") {
            version = 'latest'
        } else {
            currentBuild.result = 'SUCCESS'
            return
        }

        app = docker.build("ctrewe/rclone-two-way-sftp-gcs-sync:${version}")
    }

    stage('Push image') {
        docker.withRegistry('https://registry.hub.docker.com', 'docker-credentials') {
            app.push()
        }
    }
}