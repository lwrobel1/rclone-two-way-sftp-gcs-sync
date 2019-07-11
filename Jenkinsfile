node {
    def app
    def buildCancelled = false

    stage('Log variables') {
        /* Let's make sure we have the repository cloned to our workspace */

        printParams()
    }

    stage('Clone repository') {
        /* Let's make sure we have the repository cloned to our workspace */

        checkout scm
    }

    stage('Build image') {
        /* This builds the actual image; synonymous to
         * docker build on the command line */

        def version = getVersion()
        app = docker.build("ctrewe/rclone-two-way-sftp-gcs-sync:${version}")
    }

    stage('Push image') {
        docker.withRegistry('https://registry.hub.docker.com', 'docker-credentials') {
            app.push()
        }
    }
}

def getVersion() {
    if (${env.BRANCH_NAME} == "develop") {
        return 'latest-dev'
    }
    if (${env.BRANCH_NAME} == "master") {
        return 'latest'
    }
    else {
        buildCancelled = true
        return ''
    }
}

def printParams() {
    env.getEnvironment().each { name, value -> println "Name: $name -> Value $value" }
}
